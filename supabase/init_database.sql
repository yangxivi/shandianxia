-- ============================================================
-- 闪电侠 · 电费管理系统 - Supabase 初始化脚本
-- 在 Supabase 控制台 SQL Editor 中一次性执行
-- 架构：纯静态前端(GitHub Pages) + Supabase(Postgres + Auth + RLS + RPC)
-- 前端通过 supabase-js 直连，公开抄表走 anon 可调用的 RPC，其余走鉴权 RPC
-- ============================================================

-- 启用密码哈希扩展（如后续改用纯 DB 账号系统可参考 qrcts 的 switch_to_simple_auth.sql）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 用户档案（关联 Supabase Auth 的 auth.users）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT 'reader',   -- admin | reader
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. 设备 / 电表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_no   TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL DEFAULT '',
    meter_no    TEXT NOT NULL DEFAULT '',
    multiplier  NUMERIC(10,4) NOT NULL DEFAULT 1.0,
    reader_id   UUID,                              -- 关联 profiles.id（一人一码一设备）
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. 配置（电单价等）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. 抄表记录（按日归档）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.readings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id      UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    device_no      TEXT NOT NULL,
    meter_no       TEXT NOT NULL DEFAULT '',
    read_date      DATE NOT NULL,
    reading_value  NUMERIC(12,2) NOT NULL,
    yesterday_value NUMERIC(12,2) NOT NULL,
    multiplier     NUMERIC(10,4) NOT NULL,
    daily_kwh      NUMERIC(12,2) NOT NULL,
    unit_price     NUMERIC(8,4) NOT NULL,
    daily_fee      NUMERIC(12,2) NOT NULL,
    reader_id      UUID,
    reader_name    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, read_date)
);

CREATE INDEX IF NOT EXISTS idx_readings_device_date ON public.readings(device_id, read_date);
CREATE INDEX IF NOT EXISTS idx_readings_date ON public.readings(read_date);

-- ============================================================
-- 5. 触发器：updated_at 自动维护
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_devices ON public.devices;
CREATE TRIGGER set_updated_at_devices BEFORE UPDATE ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_config ON public.config;
CREATE TRIGGER set_updated_at_config BEFORE UPDATE ON public.config
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================
-- 6. 新用户自动建档案（Supabase Auth 注册时触发）
--    username / display_name / role 取自注册时的 user_metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'reader')
    )
    ON CONFLICT (id) DO UPDATE SET
        username    = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        role        = EXCLUDED.role;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. 权限判定辅助
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    );
$$;

-- ============================================================
-- 8. RLS 策略（纵深防御：直接表访问也被限制）
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

-- profiles：登录用户可读
DROP POLICY IF EXISTS "authenticated read profiles" ON public.profiles;
CREATE POLICY "authenticated read profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);

-- devices：登录用户可读
DROP POLICY IF EXISTS "authenticated read devices" ON public.devices;
CREATE POLICY "authenticated read devices" ON public.devices
    FOR SELECT TO authenticated USING (true);

-- config：登录用户可读
DROP POLICY IF EXISTS "authenticated read config" ON public.config;
CREATE POLICY "authenticated read config" ON public.config
    FOR SELECT TO authenticated USING (true);

-- readings：仅管理员可直接读取全量（普通抄表员经 RPC 限定范围获取，绕过 RLS）
DROP POLICY IF EXISTS "admin read readings" ON public.readings;
CREATE POLICY "admin read readings" ON public.readings
    FOR SELECT TO authenticated USING (public.is_admin());

-- ============================================================
-- 9. RPC：公开抄表提交（anon 可调用，无需登录）
--    二维码只绑定设备，提交时自动取该设备责任人为填报人
--    内置：当日重复拦截、读数<昨日异常拦截、电量电费核算
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_reading(
    p_device_no     TEXT,
    p_reading_value NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dev          public.devices%ROWTYPE;
    v_prev         public.readings%ROWTYPE;
    v_yesterday    NUMERIC;
    v_kwh          NUMERIC := 0;
    v_price        NUMERIC;
    v_fee          NUMERIC := 0;
    v_reader_id    UUID;
    v_reader_name  TEXT;
BEGIN
    IF p_reading_value <= 0 THEN
        RAISE EXCEPTION '读数必须为正数';
    END IF;

    SELECT * INTO v_dev FROM public.devices WHERE device_no = p_device_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION '设备不存在';
    END IF;

    -- 当日重复填报拦截
    IF EXISTS (
        SELECT 1 FROM public.readings
        WHERE device_id = v_dev.id AND read_date = current_date
    ) THEN
        RAISE EXCEPTION '当日已完成抄表，无需重复填报';
    END IF;

    -- 取上次读数（昨日/历史最近一次）
    SELECT * INTO v_prev FROM public.readings
    WHERE device_id = v_dev.id AND read_date < current_date
    ORDER BY read_date DESC LIMIT 1;

    IF FOUND THEN
        v_yesterday := v_prev.reading_value;
        IF p_reading_value < v_yesterday THEN
            RAISE EXCEPTION '当日读数低于昨日读数，请核对电表数据';
        END IF;
        v_kwh := round((p_reading_value - v_yesterday) * v_dev.multiplier, 2);
    ELSE
        -- 首次基准：当日电量记为 0
        v_yesterday := p_reading_value;
        v_kwh := 0;
    END IF;

    SELECT COALESCE(NULLIF(value, ''), '0.85')::NUMERIC INTO v_price
    FROM public.config WHERE key = 'unit_price';

    v_fee := round(v_kwh * v_price, 2);

    v_reader_id := v_dev.reader_id;
    SELECT display_name INTO v_reader_name FROM public.profiles WHERE id = v_dev.reader_id;

    INSERT INTO public.readings (
        device_id, device_no, meter_no, read_date,
        reading_value, yesterday_value, multiplier,
        daily_kwh, unit_price, daily_fee, reader_id, reader_name
    ) VALUES (
        v_dev.id, v_dev.device_no, v_dev.meter_no, current_date,
        p_reading_value, v_yesterday, v_dev.multiplier,
        v_kwh, v_price, v_fee, v_reader_id, v_reader_name
    );

    RETURN jsonb_build_object(
        'ok', true,
        'device_no', v_dev.device_no,
        'read_date', current_date,
        'daily_kwh', v_kwh,
        'daily_fee', v_fee
    );
END;
$$;

-- 公开设备信息（扫码页展示用，不含敏感数据）
CREATE OR REPLACE FUNCTION public.device_public_info(p_device_no TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dev public.devices%ROWTYPE;
    v_name TEXT;
BEGIN
    SELECT * INTO v_dev FROM public.devices WHERE device_no = p_device_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION '设备不存在';
    END IF;
    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_dev.reader_id;
    RETURN jsonb_build_object(
        'device_no', v_dev.device_no,
        'device_name', v_dev.device_name,
        'meter_no', v_dev.meter_no,
        'reader_name', v_name
    );
END;
$$;

-- ============================================================
-- 10. RPC：月度汇总（admin 看全厂，reader 仅看本人设备）
-- ============================================================
CREATE OR REPLACE FUNCTION public.monthly_summary(p_month TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_start      DATE := (p_month || '-01')::DATE;
    v_end        DATE := (v_start + INTERVAL '1 month')::DATE;
    v_is_admin   BOOLEAN := public.is_admin();
    v_uid        UUID := auth.uid();
    v_total_kwh  NUMERIC := 0;
    v_total_fee  NUMERIC := 0;
    v_devs       JSONB;
BEGIN
    IF v_is_admin THEN
        SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) INTO v_devs FROM (
            SELECT d.device_no, d.device_name, d.meter_no,
                   COALESCE(SUM(r.daily_kwh), 0) AS total_kwh,
                   COALESCE(SUM(r.daily_fee), 0)  AS total_fee
            FROM public.devices d
            LEFT JOIN public.readings r
              ON r.device_id = d.id AND r.read_date >= v_start AND r.read_date < v_end
            GROUP BY d.id ORDER BY d.device_no
        ) x;
        SELECT COALESCE(SUM(daily_kwh),0), COALESCE(SUM(daily_fee),0)
        INTO v_total_kwh, v_total_fee
        FROM public.readings WHERE read_date >= v_start AND read_date < v_end;
    ELSE
        SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) INTO v_devs FROM (
            SELECT d.device_no, d.device_name, d.meter_no,
                   COALESCE(SUM(r.daily_kwh), 0) AS total_kwh,
                   COALESCE(SUM(r.daily_fee), 0)  AS total_fee
            FROM public.devices d
            LEFT JOIN public.readings r
              ON r.device_id = d.id AND r.read_date >= v_start AND r.read_date < v_end
            WHERE d.reader_id = v_uid
            GROUP BY d.id ORDER BY d.device_no
        ) x;
        SELECT COALESCE(SUM(r.daily_kwh),0), COALESCE(SUM(r.daily_fee),0)
        INTO v_total_kwh, v_total_fee
        FROM public.readings r
        JOIN public.devices d ON d.id = r.device_id
        WHERE r.read_date >= v_start AND r.read_date < v_end AND d.reader_id = v_uid;
    END IF;

    RETURN jsonb_build_object(
        'devices', v_devs,
        'total_kwh', v_total_kwh,
        'total_fee', v_total_fee
    );
END;
$$;

-- ============================================================
-- 11. RPC：台账查询（admin 全量，reader 仅本人设备）
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_readings(
    p_month     TEXT   DEFAULT NULL,
    p_device_id UUID   DEFAULT NULL,
    p_meter_no  TEXT   DEFAULT NULL,
    p_reader_id UUID   DEFAULT NULL,
    p_start     DATE   DEFAULT NULL,
    p_end       DATE   DEFAULT NULL
)
RETURNS SETOF public.readings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_admin BOOLEAN := public.is_admin();
    v_uid      UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;
    RETURN QUERY
    SELECT r.*
    FROM public.readings r
    LEFT JOIN public.devices d ON d.id = r.device_id
    WHERE (p_month IS NULL OR to_char(r.read_date, 'YYYY-MM') = p_month)
      AND (p_device_id IS NULL OR r.device_id = p_device_id)
      AND (p_meter_no IS NULL OR r.meter_no = p_meter_no)
      AND (p_reader_id IS NULL OR r.reader_id = p_reader_id)
      AND (p_start IS NULL OR r.read_date >= p_start)
      AND (p_end IS NULL OR r.read_date <= p_end)
      AND (v_is_admin OR d.reader_id = v_uid)
    ORDER BY r.read_date DESC, r.device_no;
END;
$$;

-- ============================================================
-- 12. RPC：设备查询（带责任人姓名）
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_devices()
RETURNS TABLE (
    id          UUID,
    device_no   TEXT,
    device_name TEXT,
    meter_no    TEXT,
    multiplier  NUMERIC,
    reader_id   UUID,
    reader_name TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.device_no, d.device_name, d.meter_no, d.multiplier, d.reader_id,
           COALESCE(p.display_name, '') AS reader_name
    FROM public.devices d
    LEFT JOIN public.profiles p ON p.id = d.reader_id
    ORDER BY d.device_no;
END;
$$;

-- ============================================================
-- 13. RPC：设备增删改（仅 admin）
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_device(
    p_device_no   TEXT,
    p_device_name TEXT,
    p_meter_no    TEXT,
    p_multiplier  NUMERIC,
    p_reader_id   UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID, device_no TEXT, device_name TEXT, meter_no TEXT,
    multiplier NUMERIC, reader_id UUID, reader_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION '无权限：仅管理员可操作'; END IF;
    IF EXISTS (SELECT 1 FROM public.devices WHERE device_no = p_device_no) THEN
        RAISE EXCEPTION '设备编号已存在';
    END IF;
    IF EXISTS (SELECT 1 FROM public.devices WHERE meter_no = p_meter_no) THEN
        RAISE EXCEPTION '电表编号已存在';
    END IF;
    INSERT INTO public.devices (device_no, device_name, meter_no, multiplier, reader_id)
    VALUES (p_device_no, p_device_name, p_meter_no, COALESCE(p_multiplier, 1.0), p_reader_id);
    RETURN QUERY SELECT ld.* FROM public.list_devices() ld WHERE ld.device_no = p_device_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_device(
    p_id          UUID,
    p_device_no   TEXT,
    p_device_name TEXT,
    p_meter_no    TEXT,
    p_multiplier  NUMERIC,
    p_reader_id   UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID, device_no TEXT, device_name TEXT, meter_no TEXT,
    multiplier NUMERIC, reader_id UUID, reader_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION '无权限：仅管理员可操作'; END IF;
    IF EXISTS (SELECT 1 FROM public.devices WHERE device_no = p_device_no AND id <> p_id) THEN
        RAISE EXCEPTION '设备编号已存在';
    END IF;
    IF EXISTS (SELECT 1 FROM public.devices WHERE meter_no = p_meter_no AND id <> p_id) THEN
        RAISE EXCEPTION '电表编号已存在';
    END IF;
    UPDATE public.devices
    SET device_no = p_device_no, device_name = p_device_name, meter_no = p_meter_no,
        multiplier = COALESCE(p_multiplier, 1.0), reader_id = p_reader_id, updated_at = NOW()
    WHERE id = p_id;
    RETURN QUERY SELECT ld.* FROM public.list_devices() ld WHERE ld.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_device(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION '无权限：仅管理员可操作'; END IF;
    DELETE FROM public.devices WHERE id = p_id;
END;
$$;

-- ============================================================
-- 14. RPC：电单价（get 登录可读，set 仅 admin）
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_price()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_val TEXT;
BEGIN
    SELECT value INTO v_val FROM public.config WHERE key = 'unit_price';
    RETURN COALESCE(v_val, '0.85');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_price(p_value TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION '无权限：仅管理员可操作'; END IF;
    INSERT INTO public.config (key, value, note, updated_at)
    VALUES ('unit_price', p_value, '当期电单价(元/度)', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
END;
$$;

-- ============================================================
-- 15. RPC：账号列表（仅 admin，用于设备绑定下拉）
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_profiles()
RETURNS TABLE (id UUID, username TEXT, display_name TEXT, role TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION '无权限：仅管理员可操作'; END IF;
    RETURN QUERY SELECT p.id, p.username, p.display_name, p.role
    FROM public.profiles p ORDER BY p.username;
END;
$$;

-- ============================================================
-- 16. 执行权限（anon 仅可调用公开 RPC，其余仅 authenticated）
-- ============================================================
GRANT EXECUTE ON FUNCTION public.submit_reading(TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_public_info(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.monthly_summary(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.monthly_summary(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_readings(TEXT, UUID, TEXT, UUID, DATE, DATE) FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_readings(TEXT, UUID, TEXT, UUID, DATE, DATE) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_devices() FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_devices() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_device(TEXT, TEXT, TEXT, NUMERIC, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_device(TEXT, TEXT, TEXT, NUMERIC, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_device(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_device(UUID, TEXT, TEXT, TEXT, NUMERIC, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_device(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_device(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_price() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_price(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_price(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_profiles() FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_profiles() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- 17. 默认电单价
-- ============================================================
INSERT INTO public.config (key, value, note)
VALUES ('unit_price', '0.85', '当期电单价(元/度)')
ON CONFLICT (key) DO NOTHING;
