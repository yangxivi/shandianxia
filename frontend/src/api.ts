import { supabase } from "./lib/supabase";

// 登录态失效时全局触发（UI 层可监听 window.onAuthExpired）
function notifyAuthExpired(msg: string) {
  const ev = new CustomEvent("auth-expired", { detail: msg });
  window.dispatchEvent(ev);
}

// 判断是否为"请求被取消"导致的 Failed to fetch（浏览器导航/StrictMode/组件卸载时触发）
// 这类错误对用户无意义，应静默忽略
export function isCancelledError(e: any): boolean {
  const msg = e?.message || e?.toString?.() || "";
  // AbortError 是 AbortController 主动取消
  if (e?.name === "AbortError") return true;
  // Failed to fetch 在组件卸载/路由切换时通常是请求被浏览器取消
  if (msg.includes("Failed to fetch")) return true;
  return false;
}

// 统一错误提取（supabase 异常文本即业务提示）
// 注意：原生 TypeError("Failed to fetch") 通常为请求被取消，应静默忽略
export function errMsg(e: any): string {
  const msg = e?.message || e?.error_description || e?.toString?.() || "操作失败";
  // 被取消的请求不应显示错误
  if (isCancelledError(e)) return "";
  if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
    return "用户名或密码错误";
  }
  if (msg.includes("session") || msg.includes("登录已过期")) {
    return "登录已过期，请重新登录";
  }
  if (msg.includes("JWS") || msg.includes("token") || msg.includes("expired")) {
    return "登录已过期，请重新登录";
  }
  return msg;
}

// ============ 类型 ============
export interface Device {
  id: string;
  device_no: string;
  device_name: string;
  meter_no: string;
  multiplier: number;
  reader_id: string | null;
  reader_name: string | null;
}

export interface Reading {
  id: string;
  device_id: string;
  device_no: string;
  meter_no: string;
  read_date: string;
  reading_value: number;
  yesterday_value: number;
  multiplier: number;
  daily_kwh: number;
  unit_price: number;
  daily_fee: number;
  reader_id: string | null;
  reader_name: string | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: string;
}

export interface MonthlyItem {
  device_no: string;
  device_name: string;
  meter_no: string;
  total_kwh: number;
  total_fee: number;
}

export interface MonthlySummary {
  devices: MonthlyItem[];
  total_kwh: number;
  total_fee: number;
}

export interface SubmitResult {
  ok: boolean;
  device_no: string;
  read_date: string;
  daily_kwh: number;
  daily_fee: number;
}

// ============ 认证（Supabase Auth，账号映射为 xxx@sd.com） ============
// 所有账号统一使用 @sd.com 域名（seed.mjs 和 Edge Function 已对齐）。
// 保留 @sd.local 回退以兼容极早期创建的历史账号。
const EMAIL_DOMAIN = "sd.com";
const LEGACY_DOMAIN = "sd.local";

const toEmail = (username: string, domain: string = EMAIL_DOMAIN) =>
  `${username.trim()}@${domain}`;

export async function login(username: string, password: string): Promise<Profile> {
  const cleanUsername = username.trim();
  let lastError: any = null;

  // 依次尝试 @sd.com 和 @sd.local 两个域名
  // 认证错误（密码错误）时不 break，继续尝试下一个域名（账号可能在另一个域名下）
  // 仅网络错误（Failed to fetch）时停止
  for (const domain of [EMAIL_DOMAIN, LEGACY_DOMAIN]) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: toEmail(cleanUsername, domain),
        password,
      });
      if (error) throw error;
      const uid = data.user?.id;
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", uid)
        .single();
      const profile: Profile = {
        id: uid as string,
        username: cleanUsername,
        display_name: prof?.display_name || cleanUsername,
        role: prof?.role || "reader",
      };
      localStorage.setItem("full_name", profile.display_name);
      localStorage.setItem("role", profile.role);
      return profile;
    } catch (e: any) {
      lastError = e;
      // 网络错误直接停止（服务不可达）
      if (isCancelledError(e)) break;
    }
  }

  throw lastError;
}

// ============ 账号管理（通过 Edge Function 调用 Auth Admin API） ============
// 直接操作 auth.users 的 SQL RPC 不被 Supabase Auth 识别，必须走 Admin API。
// Edge Function admin-auth 内部用 service_role key 调用 Admin API，前端只需携带登录态 JWT。
async function invokeAdminAuth(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { action, ...params },
  });
  if (error) {
    // Supabase Functions SDK 在非 2xx 时返回 FunctionsHttpError / FunctionsFetchError
    // 优先提取函数返回的 JSON 错误
    if ((error as any)?.context && typeof (error as any).context.json === "function") {
      try {
        const body = await (error as any).context.json();
        if (body?.error) {
          const msg = body.error;
          if (msg.includes("登录已过期") || msg.includes("session")) notifyAuthExpired(msg);
          throw new Error(msg);
        }
      } catch { /* 忽略 JSON 解析错误 */ }
    }
    if (error?.message?.includes("登录已过期") || error?.message?.includes("session")) {
      notifyAuthExpired(error.message);
    }
    throw error;
  }
  if (data && (data as any).error) {
    const msg = (data as any).error;
    if (msg.includes("登录已过期") || msg.includes("session")) notifyAuthExpired(msg);
    throw new Error(msg);
  }
  return data;
}

export async function register(
  username: string,
  password: string,
  displayName: string,
  role: string
): Promise<Profile> {
  const data = await invokeAdminAuth("create_user", {
    username,
    password,
    display_name: displayName || username,
    role,
  });
  return data as Profile;
}

export async function logout() {
  await supabase.auth.signOut();
  localStorage.clear();
}

export async function getSession() {
  return supabase.auth.getSession();
}

// ============ 公开抄表（免登录） ============
export async function fetchDeviceInfo(deviceNo: string): Promise<{
  device_no: string;
  device_name: string;
  meter_no: string;
  reader_name: string | null;
  yesterday_reading: number | null;
}> {
  const { data, error } = await supabase.rpc("device_public_info", {
    p_device_no: deviceNo,
  });
  if (error) throw error;
  return data as any;
}

export async function submitReading(
  deviceNo: string,
  value: number
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc("submit_reading", {
    p_device_no: deviceNo,
    p_reading_value: value,
  });
  if (error) throw error;
  return data as SubmitResult;
}

// ============ 后台（需登录，权限由 RPC 内 RLS + is_admin 控制） ============
export async function listDevices(): Promise<Device[]> {
  const { data, error } = await supabase.rpc("list_devices");
  if (error) throw error;
  return (data as Device[]) || [];
}

export async function createDevice(v: {
  device_no: string;
  device_name: string;
  meter_no: string;
  multiplier: number;
  reader_id?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("create_device", {
    p_device_no: v.device_no,
    p_device_name: v.device_name,
    p_meter_no: v.meter_no,
    p_multiplier: v.multiplier,
    p_reader_id: v.reader_id ?? null,
  });
  if (error) throw error;
}

export async function updateDevice(
  id: string,
  v: {
    device_no: string;
    device_name: string;
    meter_no: string;
    multiplier: number;
    reader_id?: string | null;
  }): Promise<void> {
  const { error } = await supabase.rpc("update_device", {
    p_id: id,
    p_device_no: v.device_no,
    p_device_name: v.device_name,
    p_meter_no: v.meter_no,
    p_multiplier: v.multiplier,
    p_reader_id: v.reader_id ?? null,
  });
  if (error) throw error;
}

export async function deleteDevice(id: string) {
  const { error } = await supabase.rpc("delete_device", { p_id: id });
  if (error) throw error;
}

export async function getPrice(): Promise<string> {
  const { data, error } = await supabase.rpc("get_price");
  if (error) throw error;
  return data as string;
}

export async function setPrice(value: string) {
  const { error } = await supabase.rpc("set_price", { p_value: value });
  if (error) throw error;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.rpc("list_profiles");
  if (error) throw error;
  return (data as Profile[]) || [];
}

export async function updateProfile(
  id: string,
  v: { display_name: string; role: string }
): Promise<Profile> {
  const { data, error } = await supabase.rpc("update_profile", {
    p_id: id,
    p_display_name: v.display_name,
    p_role: v.role,
  });
  if (error) throw error;
  return (data as Profile[])[0];
}

export async function deleteProfile(id: string) {
  // 通过 Edge Function 同时删除 auth.users 和 profiles（级联）
  await invokeAdminAuth("delete_user", { id });
}

export async function batchDeleteProfiles(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => deleteProfile(id)));
}

export async function batchUpdateProfileRole(
  items: { id: string; display_name: string; role: string }[]
): Promise<void> {
  await Promise.all(
    items.map(item =>
      updateProfile(item.id, { display_name: item.display_name, role: item.role })
    )
  );
}

export async function resetPassword(id: string, newPassword: string) {
  await invokeAdminAuth("reset_password", { id, new_password: newPassword });
}

export async function listReadings(params: {
  month?: string;
  device_id?: string;
  meter_no?: string;
  reader_id?: string;
  start?: string;
  end?: string;
}): Promise<Reading[]> {
  const { data, error } = await supabase.rpc("list_readings", {
    p_month: params.month || null,
    p_device_id: params.device_id || null,
    p_meter_no: params.meter_no || null,
    p_reader_id: params.reader_id || null,
    p_start: params.start || null,
    p_end: params.end || null,
  });
  if (error) throw error;
  return (data as Reading[]) || [];
}

export async function monthlySummary(month: string): Promise<MonthlySummary> {
  const { data, error } = await supabase.rpc("monthly_summary", {
    p_month: month,
  });
  if (error) throw error;
  return data as MonthlySummary;
}
