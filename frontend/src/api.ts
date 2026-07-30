import { supabase } from "./lib/supabase";

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

// 统一错误提取（supabase 异常文本即业务提示）
export function errMsg(e: any): string {
  if (e?.message) return e.message;
  if (e?.error_description) return e.error_description;
  return e?.toString?.() || "操作失败";
}

// ============ 认证（Supabase Auth，账号映射为 xxx@sd.local） ============
const toEmail = (username: string) => `${username.trim()}@sd.local`;

export async function login(username: string, password: string): Promise<Profile> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
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
    username: username.trim(),
    display_name: prof?.display_name || username,
    role: prof?.role || "reader",
  };
  localStorage.setItem("full_name", profile.display_name);
  localStorage.setItem("role", profile.role);
  return profile;
}

export async function register(
  username: string,
  password: string,
  displayName: string,
  role: string
) {
  const { error } = await supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: { data: { username, display_name: displayName, role } },
  });
  if (error) throw error;
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
}): Promise<Device> {
  const { data, error } = await supabase.rpc("create_device", {
    p_device_no: v.device_no,
    p_device_name: v.device_name,
    p_meter_no: v.meter_no,
    p_multiplier: v.multiplier,
    p_reader_id: v.reader_id ?? null,
  });
  if (error) throw error;
  return (data as Device[])[0];
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
): Promise<Device> {
  const { data, error } = await supabase.rpc("update_device", {
    p_id: id,
    p_device_no: v.device_no,
    p_device_name: v.device_name,
    p_meter_no: v.meter_no,
    p_multiplier: v.multiplier,
    p_reader_id: v.reader_id ?? null,
  });
  if (error) throw error;
  return (data as Device[])[0];
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
