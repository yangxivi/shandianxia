// 闪电侠 · admin-auth Edge Function（纯 fetch，无外部依赖）
// 通过 Supabase Auth Admin API 创建/重置/删除账号
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sb-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "未登录" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "服务器配置缺失" }, 500);
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    // 1. 用调用者 JWT 获取用户身份
    const userRes = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anonKey },
    });
    if (!userRes.ok) return json({ error: "未登录" }, 401);
    const userData = await userRes.json();
    const uid = userData.id;
    if (!uid) return json({ error: "未登录" }, 401);

    // 2. 用 service_role key 查询 profiles 校验 admin 角色
    const profRes = await fetch(
      `${baseUrl}/rest/v1/profiles?select=role&id=eq.${uid}`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      }
    );
    const profData = await profRes.json();
    const role = profData?.[0]?.role;
    if (role !== "admin") {
      return json({ error: "无权限：仅管理员可操作" }, 403);
    }

    // Admin API 公共 headers
    const adminHeaders = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "create_user": {
        const { username, password, display_name, role: newRole } = params;
        if (!username || !password) return json({ error: "用户名和密码不能为空" }, 400);
        if (password.length < 6) return json({ error: "密码至少6位" }, 400);
        const r = newRole || "reader";
        if (!["admin", "reader"].includes(r))
          return json({ error: "角色必须为 admin 或 reader" }, 400);

        // 用户名唯一性
        const existRes = await fetch(
          `${baseUrl}/rest/v1/profiles?select=id&username=eq.${encodeURIComponent(username)}`,
          { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } }
        );
        const existData = await existRes.json();
        if (existData && existData.length > 0)
          return json({ error: "用户名已存在" }, 400);

        const email = `${username.toLowerCase()}@sd.local`;
        const createRes = await fetch(`${baseUrl}/auth/v1/admin/users`, {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              username,
              display_name: display_name || username,
              role: r,
            },
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          // 透传 Admin API 的真实错误（如 email_exists / weak_password 等）
          const msg = createData.msg || createData.message || createData.error_description || `创建失败 (HTTP ${createRes.status})`;
          // 友好化常见错误
          let friendly = msg;
          if (createData.code === "email_exists" || msg.includes("already been registered")) {
            friendly = `用户名 ${username} 已存在（可能为历史遗留的 auth.users 记录，联系管理员清理）`;
          } else if (createData.code === "weak_password") {
            friendly = "密码强度不足，请使用更复杂的密码";
          }
          return json({ error: friendly, raw: msg, code: createData.code }, 400);
        }

        // 确保 profiles 记录
        await fetch(`${baseUrl}/rest/v1/profiles`, {
          method: "POST",
          headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            id: createData.id,
            username,
            display_name: display_name || username,
            role: r,
          }),
        });

        return json({
          id: createData.id,
          username,
          display_name: display_name || username,
          role: r,
        });
      }

      case "reset_password": {
        const { id, new_password } = params;
        if (!id) return json({ error: "账号ID不能为空" }, 400);
        if (!new_password || new_password.length < 6)
          return json({ error: "密码至少6位" }, 400);

        const updateRes = await fetch(`${baseUrl}/auth/v1/admin/users/${id}`, {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify({ password: new_password }),
        });
        if (!updateRes.ok) {
          const errData = await updateRes.json();
          return json({ error: errData.message || "重置失败" }, 400);
        }

        return json({ ok: true });
      }

      case "delete_user": {
        const { id } = params;
        if (!id) return json({ error: "账号ID不能为空" }, 400);
        if (id === uid) return json({ error: "不能删除当前登录的账号" }, 400);

        // 检查关联设备
        const devRes = await fetch(
          `${baseUrl}/rest/v1/devices?select=id&reader_id=eq.${id}&limit=1`,
          { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } }
        );
        const devData = await devRes.json();
        if (devData && devData.length > 0)
          return json({ error: "该账号仍关联设备，请先解绑设备后再删除" }, 400);

        const delRes = await fetch(`${baseUrl}/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          headers: adminHeaders,
        });
        if (!delRes.ok) {
          const errData = await delRes.json();
          return json({ error: errData.message || "删除失败" }, 400);
        }

        return json({ ok: true });
      }

      default:
        return json({ error: `未知操作: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});
