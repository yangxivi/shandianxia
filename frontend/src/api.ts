import axios from "axios";

// 生产环境可设置 VITE_API_BASE 指向后端地址；开发环境留空走 vite 代理
const base = import.meta.env.VITE_API_BASE || "";

export const api = axios.create({ baseURL: base });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function errMsg(e: any): string {
  if (e?.response?.data?.detail) {
    const d = e.response.data.detail;
    return Array.isArray(d) ? d.map((x: any) => x.msg).join("；") : d;
  }
  return e?.message || "请求失败";
}

export interface Device {
  id: number;
  device_no: string;
  device_name: string;
  meter_no: string;
  multiplier: number;
  reader_id: number | null;
  reader_name: string | null;
}

export interface Reading {
  id: number;
  device_id: number;
  device_no: string;
  meter_no: string;
  read_date: string;
  reading_value: number;
  yesterday_value: number;
  multiplier: number;
  daily_kwh: number;
  unit_price: number;
  daily_fee: number;
  reader_id: number | null;
  reader_name: string | null;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

export interface MonthlyItem {
  device_no: string;
  device_name: string;
  meter_no: string;
  total_kwh: number;
  total_fee: number;
}
