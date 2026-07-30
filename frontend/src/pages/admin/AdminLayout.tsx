import { Layout, Menu, Button, Typography, Avatar, Space } from "antd";
import {
  DashboardOutlined, DatabaseOutlined, TableOutlined, QrcodeOutlined, LogoutOutlined, UserOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Sider, Header, Content } = Layout;

const items = [
  { key: "/admin/summary", icon: <DashboardOutlined />, label: "月度汇总" },
  { key: "/admin/devices", icon: <DatabaseOutlined />, label: "设备与倍率" },
  { key: "/admin/readings", icon: <TableOutlined />, label: "抄表台账" },
  { key: "/admin/qr", icon: <QrcodeOutlined />, label: "二维码生成" },
];

export default function AdminLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const sel = items.find((i) => loc.pathname.startsWith(i.key))?.key || "/admin/summary";

  const logout = () => {
    localStorage.clear();
    nav("/login");
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="dark">
        <div style={{ color: "#fff", textAlign: "center", padding: "16px 0", fontWeight: 700, fontSize: 16 }}>
          ⚡ 闪电侠电费
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[sel]} items={items} onClick={(e) => nav(e.key)} />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>电费数字化管理平台</Typography.Title>
          <Space>
            <Avatar icon={<UserOutlined />} />
            <span>{localStorage.getItem("full_name") || "用户"}</span>
            <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
