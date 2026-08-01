-- ============================================================
-- 闪电侠 · 升级脚本 2026-08-01
-- 在 Supabase 控制台 SQL Editor 中执行
-- 变更内容：
--   1. 抄表页需要登录（抄表员账号密码）
--   2. 每人每次填报后仅有两次修改机会
--   3. 去掉昨日读数展示
--   4. 增加近七日读数历史表格
--   5. 漏填自动补填机制（超过24点自动用前一天读数补填）
-- ============================================================

-- 1. 为 readings 表增加字段
ALTER TABLE public.readings
    ADD COLUMN IF NOT EXISTS edit_count     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_auto_filled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- updated_at 触发器
DROP TRIGGER IF EXISTS set_updated_at_readings ON public.readings;
CREATE TRIGGER set_updated_at_readings BEFORE UPDATE ON public.readings
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================
-- 2. 自动补填漏填日期
--    从最后一次有记录的日期之后的每一天，直到今天之前，
--    都用最后那次的读数补填（放假期间读数不变）
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_fill_missing_days(
    p_device_id UUID
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_today       DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
    v_last_date   DATE;
    v_last_value  NUMERIC;
    v_dev         public.devices%ROWTYPE;
    v_price       NUMERIC;
    v_filled      INTEGER := 0;
    v_cursor_date DATE;
    v_yesterday   NUMERIC;
    v_kwh         NUMERIC;
    v_fee         NUMERIC;
BEGIN
    SELECT * INTO v_dev FROM public.devices WHERE id = p_device_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- 取最近一次有记录的读数（非今天）
    SELECT read_date, reading_value INTO v_last_date, v_last_value
    FROM public.readings
    WHERE device_id = p_device_id AND read_date < v_today
    ORDER BY read_date DESC LIMIT 1;

    IF NOT FOUND OR v_last_date IS NULL THEN
        -- 没有历史记录，无需补填
        RETURN 0;
    END IF;

    -- 如果最近一次就是昨天（今天的前一天），无需补填
    IF v_last_date >= v_today - INTERVAL '1 day' THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(NULLIF(value, ''), '0.85')::NUMERIC INTO v_price
    FROM public.config WHERE key = 'unit_price';

    -- 从 v_last_date + 1 天开始，直到 v_today - 1，逐天补填
    v_cursor_date := v_last_date + INTERVAL '1 day';
    v_yesterday := v_last_value;

    WHILE v_cursor_date < v_today LOOP
        -- 检查该天是否已有记录（防止重复）
        IF NOT EXISTS (
            SELECT 1 FROM public.readings
            WHERE device_id = p_device_id AND read_date = v_cursor_date
        ) THEN
            -- 漏填日期用电量为 0（读数不变）
            v_kwh := 0;
            v_fee := 0;

            INSERT INTO public.readings (
                device_id, device_no, meter_no, read_date,
                reading_value, yesterday_value, multiplier,
                daily_kwh, unit_price, daily_fee,
                reader_id, reader_name, is_auto_filled, edit_count
            ) VALUES (
                v_dev.id, v_dev.device_no, v_dev.meter_no, v_cursor_date,
                v_yesterday, v_yesterday, v_dev.multiplier,
                v_kwh, v_price, v_fee,
                v_dev.reader_id,
                (SELECT display_name FROM public.profiles WHERE id = v_dev.reader_id),
                TRUE, 0
            );
            v_filled := v_filled + 1;
        END IF;

        v_yesterday := v_last_value;  -- 每天都是同样的读数
        v_cursor_date := v_cursor_date + INTERVAL '1 day';
    END LOOP;

    RETURN v_filled;
END;
$$;

-- ============================================================
-- 3. 重写 submit_reading：
--    - 需要登录（auth.uid() 非空）
--    - 登录用户必须是该设备的抄表责任人
--    - 提交前自动补填漏填日期
--    - 记录 edit_count = 0（新提交）
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_reading(
    p_device_no     TEXT,
    p_reading_value NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dev          public.devices%ROWTYPE;
    v_prev         public.readings%ROWTYPE;
    v_today        DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
    v_yesterday    NUMERIC;
    v_kwh          NUMERIC := 0;
    v_price        NUMERIC;
    v_fee          NUMERIC := 0;
    v_reader_id    UUID;
    v_reader_name  TEXT;
    v_uid          UUID := auth.uid();
    v_filled       INTEGER;
BEGIN
    -- 需要登录
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '请先登录后再抄表';
    END IF;

    IF p_reading_value <= 0 THEN
        RAISE EXCEPTION '读数必须为正数';
    END IF;

    SELECT * INTO v_dev FROM public.devices WHERE device_no = p_device_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION '设备不存在';
    END IF;

    -- 登录用户必须是该设备的抄表责任人（或管理员）
    IF v_dev.reader_id <> v_uid AND NOT public.is_admin() THEN
        RAISE EXCEPTION '您不是该设备的抄表责任人，无法填报';
    END IF;

    -- 当日重复填报拦截
    IF EXISTS (
        SELECT 1 FROM public.readings
        WHERE device_id = v_dev.id AND read_date = v_today
    ) THEN
        RAISE EXCEPTION '当日已完成抄表，如需修改请点击「修改」按钮';
    END IF;

    -- 先补填之前漏填的日期
    v_filled := public.auto_fill_missing_days(v_dev.id);

    -- 取上次读数（可能是补填后的昨天）
    SELECT * INTO v_prev FROM public.readings
    WHERE device_id = v_dev.id AND read_date < v_today
    ORDER BY read_date DESC LIMIT 1;

    IF FOUND THEN
        v_yesterday := v_prev.reading_value;
        IF p_reading_value < v_yesterday THEN
            RAISE EXCEPTION '当日读数低于昨日读数，请核对电表数据';
        END IF;
        v_kwh := round((p_reading_value - v_yesterday) * v_dev.multiplier, 2);
    ELSE
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
        daily_kwh, unit_price, daily_fee,
        reader_id, reader_name, edit_count, is_auto_filled
    ) VALUES (
        v_dev.id, v_dev.device_no, v_dev.meter_no, v_today,
        p_reading_value, v_yesterday, v_dev.multiplier,
        v_kwh, v_price, v_fee,
        v_reader_id, v_reader_name, 0, FALSE
    );

    RETURN jsonb_build_object(
        'ok', true,
        'device_no', v_dev.device_no,
        'read_date', v_today,
        'daily_kwh', v_kwh,
        'daily_fee', v_fee,
        'auto_filled_days', v_filled
    );
END;
$$;

-- ============================================================
-- 4. 新增 update_reading：修改当日读数（最多 2 次）
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_reading(
    p_device_no     TEXT,
    p_read_date     DATE,
    p_reading_value NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dev          public.devices%ROWTYPE;
    v_today        DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
    v_prev_value   NUMERIC;
    v_yesterday    NUMERIC;
    v_kwh          NUMERIC;
    v_price        NUMERIC;
    v_fee          NUMERIC;
    v_uid          UUID := auth.uid();
    v_old_edit     INTEGER;
    v_max_edits    CONSTANT INTEGER := 2;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '请先登录';
    END IF;

    IF p_reading_value <= 0 THEN
        RAISE EXCEPTION '读数必须为正数';
    END IF;

    SELECT * INTO v_dev FROM public.devices WHERE device_no = p_device_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION '设备不存在';
    END IF;

    IF v_dev.reader_id <> v_uid AND NOT public.is_admin() THEN
        RAISE EXCEPTION '您不是该设备的抄表责任人，无法修改';
    END IF;

    -- 只能修改当日的记录（或管理员可修改任意日期）
    IF p_read_date <> v_today AND NOT public.is_admin() THEN
        RAISE EXCEPTION '只能修改当日的抄表记录';
    END IF;

    -- 取当前记录
    SELECT reading_value, edit_count INTO v_prev_value, v_old_edit
    FROM public.readings
    WHERE device_id = v_dev.id AND read_date = p_read_date;

    IF NOT FOUND THEN
        RAISE EXCEPTION '该日期尚无抄表记录，请先提交';
    END IF;

    -- 修改次数限制
    IF v_old_edit >= v_max_edits THEN
        RAISE EXCEPTION '已超过最大修改次数（% 次），无法再修改', v_max_edits;
    END IF;

    -- 取昨日读数用于校验和重新核算
    SELECT reading_value INTO v_yesterday FROM public.readings
    WHERE device_id = v_dev.id AND read_date < p_read_date
    ORDER BY read_date DESC LIMIT 1;

    IF v_yesterday IS NOT NULL THEN
        IF p_reading_value < v_yesterday THEN
            RAISE EXCEPTION '读数低于昨日读数，请核对电表数据';
        END IF;
        v_kwh := round((p_reading_value - v_yesterday) * v_dev.multiplier, 2);
    ELSE
        v_yesterday := p_reading_value;
        v_kwh := 0;
    END IF;

    SELECT COALESCE(NULLIF(value, ''), '0.85')::NUMERIC INTO v_price
    FROM public.config WHERE key = 'unit_price';
    v_fee := round(v_kwh * v_price, 2);

    UPDATE public.readings SET
        reading_value  = p_reading_value,
        yesterday_value = v_yesterday,
        daily_kwh      = v_kwh,
        daily_fee      = v_fee,
        edit_count     = edit_count + 1,
        is_auto_filled = FALSE
    WHERE device_id = v_dev.id AND read_date = p_read_date;

    RETURN jsonb_build_object(
        'ok', true,
        'device_no', v_dev.device_no,
        'read_date', p_read_date,
        'daily_kwh', v_kwh,
        'daily_fee', v_fee,
        'edit_count', v_old_edit + 1,
        'remaining_edits', v_max_edits - (v_old_edit + 1)
    );
END;
$$;

-- ============================================================
-- 5. 重写 device_public_info：
--    - 需要登录
--    - 返回近七日读数历史
--    - 返回当日是否已提交、修改次数
--    - 不再单独返回 yesterday_reading（由历史表展示）
-- ============================================================
CREATE OR REPLACE FUNCTION public.device_public_info(p_device_no TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_dev       public.devices%ROWTYPE;
    v_name      TEXT;
    v_today     DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
    v_week_start DATE;
    v_today_done BOOLEAN := false;
    v_today_edit INTEGER := 0;
    v_history   JSONB;
    v_uid       UUID := auth.uid();
BEGIN
    -- 需要登录
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '请先登录后再查看';
    END IF;

    SELECT * INTO v_dev FROM public.devices WHERE device_no = p_device_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION '设备不存在';
    END IF;

    -- 身份校验：责任人或管理员
    IF v_dev.reader_id <> v_uid AND NOT public.is_admin() THEN
        RAISE EXCEPTION '您不是该设备的抄表责任人';
    END IF;

    -- 先尝试自动补填（让历史表更完整）
    PERFORM public.auto_fill_missing_days(v_dev.id);

    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_dev.reader_id;

    -- 近 7 天（含今天，往前推 6 天，共 7 天）
    v_week_start := v_today - INTERVAL '6 days';

    SELECT COALESCE(jsonb_agg(x ORDER BY x.read_date), '[]'::JSONB) INTO v_history FROM (
        SELECT read_date::TEXT AS read_date,
               reading_value,
               is_auto_filled,
               daily_kwh
        FROM public.readings
        WHERE device_id = v_dev.id
          AND read_date >= v_week_start
          AND read_date <= v_today
    ) x;

    -- 当日提交状态
    SELECT EXISTS(
        SELECT 1 FROM public.readings
        WHERE device_id = v_dev.id AND read_date = v_today
    ) INTO v_today_done;

    IF v_today_done THEN
        SELECT COALESCE(edit_count, 0) INTO v_today_edit
        FROM public.readings
        WHERE device_id = v_dev.id AND read_date = v_today;
    END IF;

    RETURN jsonb_build_object(
        'device_no', v_dev.device_no,
        'device_name', v_dev.device_name,
        'meter_no', v_dev.meter_no,
        'reader_name', v_name,
        'today_submitted', v_today_done,
        'today_edit_count', v_today_edit,
        'max_edits', 2,
        'recent_readings', v_history
    );
END;
$$;

-- 完成提示
DO $$ BEGIN
    RAISE NOTICE '升级脚本执行完成！请确认 Supabase Auth 已开启，抄表员账号已创建。';
END $$;