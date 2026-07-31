// 闪电侠 · 部署 Edge Function 脚本（通过 Supabase Management API）
// 用法：DASHBOARD_TOKEN=<token> node supabase/deploy_function.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const REF = "dpbtqwfbprartiogydqg";
const TOKEN = process.env.DASHBOARD_TOKEN;
const SLUG = "admin-auth";

if (!TOKEN) {
  console.error("缺少 DASHBOARD_TOKEN");
  process.exit(1);
}

const code = readFileSync(new URL("./functions/admin-auth/index.ts", import.meta.url), "utf-8");

async function api(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  // 1. 尝试创建函数（同时传入代码）
  console.log("→ 创建函数 + 部署代码...");
  const createRes = await api("POST", "/functions", {
    slug: SLUG,
    name: SLUG,
    verify_jwt: true,
    body: code,
  });
  console.log(`  POST /functions → ${createRes.status}`, typeof createRes.body === "string" ? createRes.body.slice(0, 300) : JSON.stringify(createRes.body).slice(0, 300));

  if (createRes.status === 200 || createRes.status === 201) {
    console.log("✅ 部署成功");
    console.log(`   URL: https://${REF}.supabase.co/functions/v1/${SLUG}`);
    return;
  }

  // 2. 如果已存在，用 PATCH 更新
  const bodyStr = JSON.stringify(createRes.body);
  if (createRes.status === 400 || createRes.status === 409 || bodyStr.includes("Duplicated") || bodyStr.includes("already exists")) {
    console.log("→ 函数已存在，更新代码...");
    const deployRes = await api("PATCH", `/functions/${SLUG}`, {
      body: code,
      verify_jwt: true,
    });
    console.log(`  PATCH /functions/${SLUG} → ${deployRes.status}`, typeof deployRes.body === "string" ? deployRes.body.slice(0, 300) : JSON.stringify(deployRes.body).slice(0, 300));
    if (deployRes.status === 200 || deployRes.status === 201) {
      console.log("✅ 更新成功");
      console.log(`   URL: https://${REF}.supabase.co/functions/v1/${SLUG}`);
      return;
    }
  }

  console.error("❌ 部署失败");
  process.exit(1);
}

main().catch(e => {
  console.error("❌", e.message);
  process.exit(1);
});
