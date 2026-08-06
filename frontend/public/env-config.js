// 运行时配置：修改此文件即可更换 Supabase 实例 / 落地地址，无需重新构建
// 注意：anon key 为公开密钥（设计上可暴露在前端），真正权限由数据库 RLS 控制
window.__ENV__ = {
  VITE_SUPABASE_URL: 'https://dpbtqwfbprartiogydqg.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_m6iKgdv8VRGdx1KXAzWpSQ_BCDocpl_',
  // 二维码扫码落地地址（HashRouter，注意带 #）
  PUBLIC_BASE_URL: 'https://sdx.xiviai.cn/#',
};