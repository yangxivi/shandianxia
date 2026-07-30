import { useState } from "react";
import { Button, Card, Form, Input, Typography, App } from "antd";
import { ThunderboltOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "../api";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      const body = new URLSearchParams();
      body.set("username", v.username);
      body.set("password", v.password);
      const { data } = await api.post("/api/auth/login", body);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("full_name", data.full_name);
      message.success(`欢迎，${data.full_name}`);
      nav("/admin");
    } catch (e: any) {
      message.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1677ff 0%,#69b1ff 100%)" }}>
      <Card style={{ width: 360, boxShadow: "0 8px 30px rgba(0,0,0,.15)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <ThunderboltOutlined style={{ fontSize: 40, color: "#1677ff" }} />
          <Typography.Title level={3} style={{ margin: "10px 0 0" }}>闪电侠 · 电费管理</Typography.Title>
          <Typography.Text type="secondary">后台登录（管理员 / 抄表员）</Typography.Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          默认管理员 admin / admin123；抄表员 reader01 / reader123
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
