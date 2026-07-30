import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 设为相对路径，便于直接部署到 GitHub Pages 子路径
// 后端已改为 Supabase（外链数据库），前端不再需要 VITE_API_BASE / 代理
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
