import { useState } from "react";
import { Button, Card, Form, Input, Typography, App } from "antd";
import { ThunderboltOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { login, errMsg } from "../api";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.username, v.password);
      message.success("登录成功");
      nav("/admin");
    } catch (e: any) {
      const msg = errMsg(e);
      if (msg) message.error(msg);
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
        <Form form={form} onFinish={onFinish} size="large">
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
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, textAlign: "center", fontSize: 12, marginBottom: 0 }}>
          需注册账号？请联系系统管理员在「账号管理」后台新增
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
