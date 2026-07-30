import { createClient } from "@supabase/supabase-js";

const env = (window as any).__ENV__ || {};

const SUPABASE_URL = env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // 部署前请确认 env-config.js 已配置（无需重新构建）
  console.error("缺少 Supabase 配置，请检查 env-config.js 中的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// 二维码落地地址（扫码打开的抄表页根地址），可由 env-config.js 覆盖
export const PUBLIC_BASE_URL: string =
  env.PUBLIC_BASE_URL ||
  `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}`;
