import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 设为相对路径，便于直接部署到 GitHub Pages 子路径
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发时把 /api 代理到本地后端，避免跨域
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
