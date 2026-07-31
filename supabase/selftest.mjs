// 闪电侠 · 端到端自检脚本（anon key + admin 登录态调用 Edge Function + RPC）
// 用法： ADMIN_EMAIL=xiviyang@sd.local ADMIN_PASS=xxx node supabase/selftest.mjs
import "./polyfill.mjs";
import { createClient } from "@supabase/supabase-js";

const URL = "https://dpbtqwfbprartiogydqg.supabase.co";
const ANON = "sb_publishable_m6iKgdv8VRGdx1KXAzWpSQ_BCDocpl_";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "xiviyang@sd.local";
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_PASS) {
  console.error("缺少 ADMIN_PASS 环境变量（管理员密码）");
  process.exit(1);
}

const supabase = createClient(URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = String(Date.now()).slice(-6);
const TEST_USER = `selftest_${stamp}`;
const TEST_PASS_1 = "test123456";
const TEST_PASS_2 = "newpass789";

let pass = 0, fail = 0;
const log = (ok, name, detail = "") => {
  const tag = ok ? "✅ PASS" : "❌ FAIL";
  console.log(`${tag}  ${name}${detail ? "  " + detail : ""}`);
  ok ? pass++ : fail++;
};

// 通过 Edge Function 调用 Admin API（与前端 api.ts 同路径）
async function invokeAdminAuth(action, params) {
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { action, ...params },
  });
  return { data, error: error || (data?.error ? new Error(data.error) : null) };
}

// 1) admin 登录
{
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  log(!error && !!data.session, "admin 登录", error ? error.message : "session ok");
  if (error) process.exit(1);
}

// 2) list_profiles（RPC，admin 权限）
{
  const { data, error } = await supabase.rpc("list_profiles");
  log(!error && Array.isArray(data), "list_profiles", error ? error.message : `count=${data?.length}`);
}

// 3) create_user（通过 Edge Function → Admin API）
{
  const { data, error } = await invokeAdminAuth("create_user", {
    username: TEST_USER,
    password: TEST_PASS_1,
    display_name: `自检账号${stamp}`,
    role: "reader",
  });
  log(!error && data?.id, "create_user (Edge Function)", error ? error.message : `created ${data?.username}`);
}

// 4) 用新账号登录（核心：验证 Admin API 密码生效）
{
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${TEST_USER}@sd.local`,
    password: TEST_PASS_1,
  });
  log(!error && !!data.session, "新账号登录（create_user 密码生效）", error ? error.message : `uid=${data.user?.id?.slice(0,8)}…`);
}

// 5) reader 无权限调用 list_profiles（权限隔离）
{
  const { data, error } = await supabase.rpc("list_profiles");
  log(!!error, "reader 调用 list_profiles 被拒（权限隔离）", error ? `拦截: ${error.message.slice(0,40)}` : "❌ 未拦截！");
}

// 5b) reader 无权限调用 Edge Function（权限隔离）
{
  const { data, error } = await invokeAdminAuth("create_user", {
    username: "should_fail",
    password: "test123456",
    display_name: "should_fail",
    role: "reader",
  });
  log(!!error, "reader 调用 admin-auth 被拒（Edge Function 权限隔离）", error ? `拦截: ${error.message.slice(0,40)}` : "❌ 未拦截！");
}

// 6) admin 重新登录后 reset_password（通过 Edge Function → Admin API）
{
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  log(!error, "admin 重新登录", error ? error.message : "ok");

  const { data: profiles } = await supabase.rpc("list_profiles");
  const found = profiles?.find(p => p.username === TEST_USER);
  log(!!found, "在 profiles 中找到新账号", found ? `id=${found.id.slice(0,8)}… role=${found.role}` : "未找到");

  if (found) {
    const { error: resetErr } = await invokeAdminAuth("reset_password", {
      id: found.id,
      new_password: TEST_PASS_2,
    });
    log(!resetErr, "reset_password (Edge Function)", resetErr ? resetErr.message : "ok");
  }
}

// 7) 用新密码登录（核心：验证重置后密码生效）
{
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${TEST_USER}@sd.local`,
    password: TEST_PASS_2,
  });
  log(!error && !!data.session, "新密码登录（reset_password 生效）", error ? error.message : "ok");

  // 7b) 旧密码应失败
  const { error: oldErr } = await supabase.auth.signInWithPassword({
    email: `${TEST_USER}@sd.local`,
    password: TEST_PASS_1,
  });
  log(!!oldErr, "旧密码已失效", oldErr ? `已拒绝: ${oldErr.message.slice(0,40)}` : "❌ 旧密码仍可用！");
}

// 8) 清理：通过 Edge Function 删除测试账号（同时清理 auth.users）
{
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (!error) {
    const { data: profiles } = await supabase.rpc("list_profiles");
    const found = profiles?.find(p => p.username === TEST_USER);
    if (found) {
      const { error: delErr } = await invokeAdminAuth("delete_user", { id: found.id });
      log(!delErr, "清理：delete_user (Edge Function)", delErr ? delErr.message : "ok");

      // 验证 auth.users 也被清理
      await supabase.auth.signOut();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: `${TEST_USER}@sd.local`,
        password: TEST_PASS_2,
      });
      log(!!loginErr, "已删除账号无法登录", loginErr ? `已拒绝: ${loginErr.message.slice(0,40)}` : "❌ 仍可登录！");
    }
  }
}

console.log(`\n=== 自检结果: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
