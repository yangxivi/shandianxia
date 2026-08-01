-- ============================================================
-- 闪电侠 · 升级脚本 2026-08-01（管理员台账权限）
-- 在 Supabase 控制台 SQL Editor 中执行
-- 变更内容：
--   1. 新增 delete_reading：管理员可删除任意抄表记录
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_reading(
    p_reading_id UUID
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    -- 需要登录
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '请先登录';
    END IF;

    -- 仅管理员可删除
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION '仅管理员可删除抄表记录';
    END IF;

    -- 检查记录是否存在
    IF NOT EXISTS (
        SELECT 1 FROM public.readings WHERE id = p_reading_id
    ) THEN
        RAISE EXCEPTION '记录不存在';
    END IF;

    DELETE FROM public.readings WHERE id = p_reading_id;
    RETURN TRUE;
END;
$$;

-- 完成提示
DO $$ BEGIN
    RAISE NOTICE '管理员台账权限升级完成！管理员现可编辑和删除抄表记录。';
END $$;
