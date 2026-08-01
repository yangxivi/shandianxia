import { supabase } from "./lib/supabase";

function notifyAuthExpired(msg: string) {
  const ev = new CustomEvent("auth-expired", { detail: msg });
  window.dispatchEvent(ev);
}

export function isCancelledError(e: any): boolean {
  const msg = e?.message || e?.toString?.() || "";
  if (e?.name === "AbortError") return true;
  if (msg.includes("Failed to fetch")) return true;
  return false;
}

export function errMsg(e: any): string {
  const msg = e?.message || e?.error_description || e?.toString?.() || "操作失败";
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
  edit_count?: number;
  is_auto_filled?: boolean;
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
  auto_filled_days?: number;
}

export interface UpdateResult {
  ok: boolean;
  device_no: string;
  read_date: string;
  daily_kwh: number;
  daily_fee: number;
  edit_count: number;
  remaining_edits: number;
}

export interface RecentReading {
  read_date: string;
  reading_value: number;
  is_auto_filled: boolean;
  daily_kwh: number;
}

export interface DeviceInfo {
  device_no: string;
  device_name: string;
  meter_no: string;
  reader_name: string | null;
  today_submitted: boolean;
  today_edit_count: number;
  max_edits: number;
  recent_readings: RecentReading[];
}

const EMAIL_DOMAIN = "sd.com";
const LEGACY_DOMAIN = "sd.local";
const toEmail = (username: string, domain: string = EMAIL_DOMAIN) =>
  `${username.trim()}@${domain}`;

export async function login(username: string, password: string): Promise<Profile> {
  const cleanUsername = username.trim();
  let lastError: any = null;
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
      if (isCancelledError(e)) break;
    }
  }
  throw lastError;
}

async function invokeAdminAuth(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { action, ...params },
  });
  if (error) {
    if ((error as any)?.context && typeof (error as any).context.json === "function") {
      try {
        const body = await (error as any).context.json();
        if (body?.error) {
          const msg = body.error;
          if (msg.includes("登录已过期") || msg.includes("session")) notifyAuthExpired(msg);
          throw new Error(msg);
        }
      } catch { /* ignore */ }
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

export async function fetchDeviceInfo(deviceNo: string): Promise<DeviceInfo> {
  const { data, error } = await supabase.rpc("device_public_info", {
    p_device_no: deviceNo,
  });
  if (error) throw error;
  return data as DeviceInfo;
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

export async function updateReading(
  deviceNo: string,
  readDate: string,
  value: number
): Promise<UpdateResult> {
  const { data, error } = await supabase.rpc("update_reading", {
    p_device_no: deviceNo,
    p_read_date: readDate,
    p_reading_value: value,
  });
  if (error) throw error;
  return data as UpdateResult;
}

export async function deleteReading(readingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_reading", {
    p_reading_id: readingId,
  });
  if (error) throw error;
  return data as boolean;
}

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
  }
): Promise<void> {
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
