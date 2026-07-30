// ============================================================
// 闪电侠 · 一次性种子脚本（本地运行，需 service_role 权限）
// 在 Supabase 控制台 → Project Settings → API 复制：
//   SUPABASE_URL 与 service_role key（务必保密，勿提交）
//
// 用法：
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//   node supabase/seed.mjs
//
// 作用：创建 admin + 30 抄表员账号，并生成 30 台设备（一人一码一设备）
// 已存在则跳过，可重复执行。
// ============================================================
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEVICE_COUNT = 30;

async function ensureUser(email, password, meta) {
  // 先看是否已存在
  const { data: list } = await admin.auth.admin.listUsers();
  const exist = list?.users?.find((u) => u.email === email);
  if (exist) {
    // 同步档案角色/姓名
    await admin.from("profiles").upsert({
      id: exist.id,
      username: meta.username,
      display_name: meta.display_name,
      role: meta.role,
    });
    return exist.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    emailConfirm: true, // v2 管理接口用 camelCase；标记为已确认，免邮件验证（项目未配 SMTP）
    user_metadata: meta,
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  console.log("→ 创建管理员 admin ...");
  const adminId = await ensureUser("admin@sd.local", "admin123", {
    username: "admin",
    display_name: "系统管理员",
    role: "admin",
  });

  console.log(`→ 创建 ${DEVICE_COUNT} 抄表员并绑定设备 ...`);
  for (let i = 1; i <= DEVICE_COUNT; i++) {
    const no = String(i).padStart(2, "0");
    const username = `reader${no}`;
    const email = `${username}@sd.local`;
    const readerId = await ensureUser(email, "reader123", {
      username,
      display_name: `抄表员${no}`,
      role: "reader",
    });
    const deviceNo = `DEV-${no}`;
    const { error } = await admin.from("devices").upsert(
      {
        device_no: deviceNo,
        device_name: `生产设备${no}号`,
        meter_no: `METER-${no}`,
        multiplier: 1.0,
        reader_id: readerId,
      },
      { onConflict: "device_no" }
    );
    if (error) throw error;
  }

  // 默认电单价
  await admin.from("config").upsert(
    { key: "unit_price", value: "0.85", note: "当期电单价(元/度)" },
    { onConflict: "key" }
  );

  console.log("✅ 种子完成：1 管理员 + 30 抄表员 + 30 设备（一人一码一设备）");
  console.log("   管理员登录：admin / admin123");
  console.log("   抄表员登录：reader01 ~ reader30 / reader123");
}

main().catch((e) => {
  console.error("❌ 种子失败：", e.message);
  process.exit(1);
});
