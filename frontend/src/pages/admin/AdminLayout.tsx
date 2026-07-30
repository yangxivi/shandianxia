import { useState, useEffect, useCallback } from "react";
import { Layout, Menu, Button, Avatar, Space, Typography, Tabs } from "antd";
import {
  DashboardOutlined, DatabaseOutlined, TableOutlined, QrcodeOutlined,
  TeamOutlined, LogoutOutlined, UserOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout as supabaseLogout } from "../../api";

const { Header, Content, Footer } = Layout;

/* ── 导航定义 ── */
const navItems = [
  { key: "/admin/summary", icon: <DashboardOutlined />, label: "月度汇总" },
  { key: "/admin/devices",  icon: <DatabaseOutlined />, label: "设备与倍率" },
  { key: "/admin/readings", icon: <TableOutlined />,    label: "抄表台账" },
  { key: "/admin/accounts",  icon: <TeamOutlined />,     label: "账号管理" },
  { key: "/admin/qr",       icon: <QrcodeOutlined />,   label: "二维码生成" },
];

const navLabelMap: Record<string, string> = Object.fromEntries(
  navItems.map((i) => [i.key, i.label])
);

/* ── 主布局：顶部导航 + 标签页 + 固定底栏 ── */
export default function AdminLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [openTabs, setOpenTabs] = useState<{ key: string; label: string }[]>([
    { key: "/admin/summary", label: "月度汇总" },
  ]);
  const [activeKey, setActiveKey] = useState("/admin/summary");

  /* 导航点击 → 打开标签并跳转 */
  const handleNavClick = useCallback(
    (key: string) => {
      if (!openTabs.find((t) => t.key === key)) {
        setOpenTabs((prev) => [...prev, { key, label: navLabelMap[key] || key }]);
      }
      setActiveKey(key);
      nav(key);
    },
    [nav, openTabs]
  );

  /* 关闭标签 */
  const closeTab = (targetKey: string) => {
    const idx = openTabs.findIndex((t) => t.key === targetKey);
    if (idx === -1) return;
    const next = [...openTabs];
    next.splice(idx, 1);
    setOpenTabs(next);

    // 如果关闭的是当前标签，切换到相邻标签
    if (activeKey === targetKey && next.length > 0) {
      const newActive = next[Math.min(idx, next.length - 1)].key;
      setActiveKey(newActive);
      nav(newActive);
    }
    // 如果全部关了，回到首页
    if (next.length === 0) {
      setActiveKey("/admin/summary");
      nav("/admin/summary");
    }
  };

  /* 标签切换 */
  const onTabChange = (key: string) => {
    setActiveKey(key);
    nav(key);
  };

  /* URL 变化时同步 activeKey（浏览器前进/后退） */
  useEffect(() => {
    const matched = openTabs.find((t) => loc.pathname.startsWith(t.key.replace("/admin/", "")));
    // 精确匹配或前缀匹配
    const found = openTabs.find((t) =>
      t.key === loc.pathname || loc.pathname.startsWith(t.key + "/") || loc.pathname === t.key
    );
    if (found && found.key !== activeKey) {
      setActiveKey(found.key);
    }
  }, [loc.pathname]);

  /* 选中菜单项 */
  const selectedMenu = navItems.find((i) =>
    i.key === loc.pathname || loc.pathname.startsWith(i.key)
  )?.key || "/admin/summary";

  const logout = async () => {
    await supabaseLogout();
    nav("/login");
  };

  return (
    <Layout style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ════════════════ 固定顶部导航栏 ════════════════ */}
      <Header
        style={{
          background: "#001529",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          lineHeight: "56px",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {/* 左侧：Logo + 水平导航 */}
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div
            style={{
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
              marginRight: 32,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onClick={() => handleNavClick("/admin/summary")}
          >
            <ThunderboltOutlined style={{ color: "#1677ff", fontSize: 20 }} />
            闪电侠
          </div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedMenu]}
            items={navItems}
            onClick={(e) => handleNavClick(e.key)}
            style={{
              background: "transparent",
              border: "none",
              lineHeight: "54px",
              flex: 1,
            }}
          />
        </div>

        {/* 右侧：用户信息 + 退出 */}
        <Space size={12} style={{ marginLeft: 16, whiteSpace: "nowrap" }}>
          <Avatar
            size="small"
            icon={<UserOutlined />}
            style={{ backgroundColor: "#1677ff" }}
          />
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            {localStorage.getItem("full_name") || "管理员"}
          </span>
          <Button
            type="text"
            size="small"
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            退出
          </Button>
        </Space>
      </Header>

      {/* ════════════════ 标签页栏 ════════════════ */}
      <div
        style={{
          position: "fixed",
          top: 56,
          left: 0,
          right: 0,
          height: 40,
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={activeKey}
          onChange={onTabChange}
          onEdit={(targetKey, action) => {
            if (action === "remove") closeTab(targetKey as string);
          }}
          items={openTabs.map((t) => ({
            key: t.key,
            label: t.label,
            closable: openTabs.length > 1 || t.key !== "/admin/summary",
          }))}
          size="small"
          style={{
            width: "100%",
            height: 40,
          }}
          tabBarStyle={{
            marginBottom: 0,
            height: 40,
            paddingTop: 2,
          }}
        />
      </div>

      {/* ════════════════ 内容区 ════════════════ */}
      <Content
        style={{
          marginTop: 96,   /* 56(header) + 40(tabs) */
          marginBottom: 36, /* footer */
          padding: "16px 24px",
          background: "#f5f5f5",
          minHeight: "calc(100vh - 132px)",
          overflow: "auto",
        }}
      >
        <Outlet />
      </Content>

      {/* ════════════════ 固定底部状态栏 ════════════════ */}
      <Footer
        style={{
          textAlign: "center",
          padding: "8px 24px",
          background: "#fafafa",
          borderTop: "1px solid #e8e8e8",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 998,
          height: 36,
          lineHeight: "19px",
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          ⚡ 闪电侠 · Supabase 驱动 · {new Date().toLocaleDateString("zh-CN")}
        </Typography.Text>
      </Footer>
    </Layout>
  );
}
