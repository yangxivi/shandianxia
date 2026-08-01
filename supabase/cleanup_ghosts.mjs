// 清理 auth.users 中的幽灵用户（无对应 profiles 记录的）
import "./polyfill.mjs";
import { createClient } from "@supabase/supabase-js";

const URL = "https://dpbtqwfbprartiogydqg.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 获取所有 profiles
const { data: profiles } = await admin.from("profiles").select("id, username");
const profileIds = new Set((profiles || []).map(p => p.id));
console.log(`→ profiles 表有 ${profileIds.size} 条记录`);

// 列出所有 auth.users
const { data: listData } = await admin.auth.admin.listUsers();
const users = listData.users || [];
console.log(`→ auth.users 表有 ${users.length} 条记录`);

const ghosts = users.filter(u => !profileIds.has(u.id));
console.log(`→ 发现 ${ghosts.length} 个幽灵用户（无 profiles）:`);
for (const u of ghosts) {
  console.log(`  ${u.email}  id=${u.id}`);
}

// 删除幽灵用户
let ok = 0, fail = 0;
for (const u of ghosts) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) { console.log(`  ❌ ${u.email}: ${error.message}`); fail++; }
  else { console.log(`  ✅ 已删除 ${u.email}`); ok++; }
}
console.log(`\n完成: ${ok} 删除成功, ${fail} 失败`);
