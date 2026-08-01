// 闪电侠 · 全功能端到端自检脚本（覆盖设备/抄表/汇总/单价/公开抄表等）
// 用法： ADMIN_EMAIL=xiviyang@sd.local ADMIN_PASS=xxx node supabase/selftest_full.mjs
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
const TEST_DEVICE_NO = `TST${stamp}`;
const TEST_METER_NO = `M${stamp}`;
const TEST_READER = `tstrdr_${stamp}`;
const TEST_READER_PASS = "test123456";

let pass = 0, fail = 0;
const log = (ok, name, detail = "") => {
  const tag = ok ? "✅ PASS" : "❌ FAIL";
  console.log(`${tag}  ${name}${detail ? "  " + detail : ""}`);
  ok ? pass++ : fail++;
};

async function invokeAdminAuth(action, params) {
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { action, ...params },
  });
  return { data, error: error || (data?.error ? new Error(data.error) : null) };
}

// ========== 0. admin 登录 ==========
{
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  log(!error && !!data.session, "admin 登录", error ? error.message : "session ok");
  if (error) process.exit(1);
}

// ========== 1. 电单价配置 ==========
let originalPrice = null;
{
  // get_price
  const { data: price, error: gpErr } = await supabase.rpc("get_price");
  log(!gpErr && price != null, "get_price", gpErr ? gpErr.message : `当前单价=${price}`);
  originalPrice = price;

  // set_price（改为 0.92 测试）
  const { data: setRes, error: spErr } = await supabase.rpc("set_price", { p_value: "0.92" });
  log(!spErr && setRes?.ok, "set_price (0.92)", spErr ? spErr.message : "ok");

  // 验证已更新
  const { data: price2 } = await supabase.rpc("get_price");
  log(price2 === "0.92", "set_price 生效验证", `单价=${price2}`);

  // 恢复原价
  if (originalPrice) {
    await supabase.rpc("set_price", { p_value: String(originalPrice) });
  }
}

// ========== 2. 创建测试抄表员账号 ==========
let readerId = null;
{
  const { data, error } = await invokeAdminAuth("create_user", {
    username: TEST_READER,
    password: TEST_READER_PASS,
    display_name: `测试抄表员${stamp}`,
    role: "reader",
  });
  log(!error && data?.id, "创建测试抄表员", error ? error.message : `id=${data?.id?.slice(0,8)}…`);
  readerId = data?.id;
}

// ========== 3. 设备管理 CRUD ==========
let deviceId = null;
{
  // create_device
  const { error: cdErr } = await supabase.rpc("create_device", {
    p_device_no: TEST_DEVICE_NO,
    p_device_name: `测试设备${stamp}`,
    p_meter_no: TEST_METER_NO,
    p_multiplier: 1.5,
    p_reader_id: readerId,
  });
  log(!cdErr, "create_device", cdErr ? cdErr.message : `设备=${TEST_DEVICE_NO}`);

  // 重复编号应失败
  const { error: dupErr } = await supabase.rpc("create_device", {
    p_device_no: TEST_DEVICE_NO,
    p_device_name: "重复",
    p_meter_no: `DUP${stamp}`,
    p_multiplier: 1.0,
    p_reader_id: null,
  });
  log(!!dupErr, "create_device 重复编号拦截", dupErr ? `拦截: ${dupErr.message.slice(0,40)}` : "❌ 未拦截！");

  // list_devices
  const { data: devices, error: ldErr } = await supabase.rpc("list_devices");
  const found = devices?.find(d => d.device_no === TEST_DEVICE_NO);
  log(!ldErr && found, "list_devices", ldErr ? ldErr.message : `找到测试设备, reader=${found?.reader_name || '无'}`);
  deviceId = found?.id;

  // update_device
  if (deviceId) {
    const { error: udErr } = await supabase.rpc("update_device", {
      p_id: deviceId,
      p_device_no: TEST_DEVICE_NO,
      p_device_name: `测试设备_改名${stamp}`,
      p_meter_no: TEST_METER_NO,
      p_multiplier: 2.0,
      p_reader_id: readerId,
    });
    log(!udErr, "update_device", udErr ? udErr.message : "改名+倍率改2.0 ok");

    // 验证更新
    const { data: devices2 } = await supabase.rpc("list_devices");
    const updated = devices2?.find(d => d.id === deviceId);
    log(updated?.device_name?.includes("改名") && Number(updated?.multiplier) === 2.0,
      "update_device 生效验证", `name=${updated?.device_name}, multiplier=${updated?.multiplier}`);
  }
}

// ========== 4. 公开抄表（免登录） ==========
let firstReading = 100.50;
{
  // 先登出（模拟匿名访问）
  await supabase.auth.signOut();

  // device_public_info（anon 可调用）
  const { data: info, error: piErr } = await supabase.rpc("device_public_info", {
    p_device_no: TEST_DEVICE_NO,
  });
  log(!piErr && info?.device_no, "device_public_info (anon)", piErr ? piErr.message : `设备=${info?.device_no}, 昨日读数=${info?.yesterday_reading ?? '无'}`);

  // submit_reading（anon 可调用，首次抄表）
  const { data: sub1, error: sub1Err } = await supabase.rpc("submit_reading", {
    p_device_no: TEST_DEVICE_NO,
    p_reading_value: firstReading,
  });
  log(!sub1Err && sub1?.ok, "submit_reading 首次抄表 (anon)", sub1Err ? sub1Err.message : `日期=${sub1?.read_date}, kwh=${sub1?.daily_kwh}, fee=${sub1?.daily_fee}`);

  // 当日重复提交应失败
  const { error: dupErr } = await supabase.rpc("submit_reading", {
    p_device_no: TEST_DEVICE_NO,
    p_reading_value: firstReading + 10,
  });
  log(!!dupErr, "submit_reading 当日重复拦截", dupErr ? `拦截: ${dupErr.message.slice(0,40)}` : "❌ 未拦截！");

  // 读数低于昨日应失败（需要先有昨日数据，此处验证逻辑）
  // 注意：首次抄表后，当日再提交低于首次的会触发"当日重复"先拦截
  // 所以这个场景在跨日时才能完整测试，此处仅验证重复拦截
}

// ========== 5. 抄表台账查询（admin） ==========
{
  // admin 重新登录
  await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const month = today.slice(0, 7);

  // list_readings 按月份筛选
  const { data: readings, error: lrErr } = await supabase.rpc("list_readings", {
    p_month: month,
    p_device_id: deviceId,
  });
  const foundReading = readings?.find(r => r.device_no === TEST_DEVICE_NO);
  log(!lrErr && foundReading, "list_readings 按月份+设备筛选", lrErr ? lrErr.message : `找到测试记录, kwh=${foundReading?.daily_kwh}`);

  // list_readings 按电表编号筛选
  const { data: readings2, error: lr2Err } = await supabase.rpc("list_readings", {
    p_meter_no: TEST_METER_NO,
  });
  const found2 = readings2?.find(r => r.meter_no === TEST_METER_NO);
  log(!lr2Err && found2, "list_readings 按电表编号筛选", lr2Err ? lr2Err.message : `找到${readings2?.length}条`);

  // list_readings 按日期区间筛选
  const { data: readings3, error: lr3Err } = await supabase.rpc("list_readings", {
    p_start: today,
    p_end: today,
  });
  log(!lr3Err && Array.isArray(readings3), "list_readings 按日期区间筛选", lr3Err ? lr3Err.message : `找到${readings3?.length}条`);

  // list_readings 按抄表人筛选
  const { data: readings4, error: lr4Err } = await supabase.rpc("list_readings", {
    p_reader_id: readerId,
  });
  log(!lr4Err && Array.isArray(readings4), "list_readings 按抄表人筛选", lr4Err ? lr4Err.message : `找到${readings4?.length}条`);
}

// ========== 6. 月度汇总 ==========
{
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const month = today.slice(0, 7);

  const { data: summary, error: msErr } = await supabase.rpc("monthly_summary", {
    p_month: month,
  });
  const foundDev = summary?.devices?.find(d => d.device_no === TEST_DEVICE_NO);
  log(!msErr && summary?.devices, "monthly_summary (admin)", msErr ? msErr.message : `设备数=${summary?.devices?.length}, 总电量=${summary?.total_kwh}, 总电费=${summary?.total_fee}`);
  log(!!foundDev, "monthly_summary 包含测试设备", foundDev ? `kwh=${foundDev.total_kwh}, fee=${foundDev.total_fee}` : "未找到");
}

// ========== 7. 编辑账号（update_profile） ==========
{
  const { data: updated, error: upErr } = await supabase.rpc("update_profile", {
    p_id: readerId,
    p_display_name: `改名抄表员${stamp}`,
    p_role: "reader",
  });
  log(!upErr && updated?.[0]?.display_name?.includes("改名"), "update_profile 改名", upErr ? upErr.message : `新名=${updated?.[0]?.display_name}`);

  // 非法角色应失败
  const { error: badRoleErr } = await supabase.rpc("update_profile", {
    p_id: readerId,
    p_display_name: "test",
    p_role: "superadmin",
  });
  log(!!badRoleErr, "update_profile 非法角色拦截", badRoleErr ? `拦截: ${badRoleErr.message.slice(0,40)}` : "❌ 未拦截！");
}

// ========== 8. reader 权限隔离（设备管理） ==========
{
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: `${TEST_READER}@sd.local`,
    password: TEST_READER_PASS,
  });
  log(!error, "测试抄表员登录", error ? error.message : "ok");

  // reader 不能创建设备
  const { error: cdErr } = await supabase.rpc("create_device", {
    p_device_no: `FORBID${stamp}`,
    p_device_name: "禁止",
    p_meter_no: `FORBIDM${stamp}`,
    p_multiplier: 1.0,
    p_reader_id: null,
  });
  log(!!cdErr, "reader 创建设备被拒", cdErr ? `拦截: ${cdErr.message.slice(0,40)}` : "❌ 未拦截！");

  // reader 不能设置单价
  const { error: spErr } = await supabase.rpc("set_price", { p_value: "0.99" });
  log(!!spErr, "reader 设置单价被拒", spErr ? `拦截: ${spErr.message.slice(0,40)}` : "❌ 未拦截！");

  // reader 可查看自己的设备（list_devices 登录即可）
  const { data: devs, error: ldErr } = await supabase.rpc("list_devices");
  log(!ldErr && Array.isArray(devs), "reader 查看设备列表", ldErr ? ldErr.message : `可看${devs?.length}台`);

  // reader 月度汇总只看自己的设备
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const month = today.slice(0, 7);
  const { data: summary, error: msErr } = await supabase.rpc("monthly_summary", { p_month: month });
  log(!msErr, "reader 月度汇总(仅本人设备)", msErr ? msErr.message : `设备数=${summary?.devices?.length}`);
}

// ========== 9. 清理：删除测试设备 + 测试账号 ==========
{
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  log(!error, "admin 重新登录(清理)", error ? error.message : "ok");

  // 删除设备
  if (deviceId) {
    const { error: ddErr } = await supabase.rpc("delete_device", { p_id: deviceId });
    log(!ddErr, "清理：delete_device", ddErr ? ddErr.message : "ok");
  }

  // 删除测试抄表员账号（通过 Edge Function）
  if (readerId) {
    const { error: duErr } = await invokeAdminAuth("delete_user", { id: readerId });
    log(!duErr, "清理：delete_user (测试抄表员)", duErr ? duErr.message : "ok");
  }
}

console.log(`\n=== 全功能自检结果: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
