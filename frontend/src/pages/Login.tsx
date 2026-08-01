import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Typography, App } from "antd";
import { ThunderboltOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login, errMsg, getSession } from "../api";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  // 已登录则跳转
  useEffect(() => {
    let mounted = true;
    getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        const redirect = params.get("redirect");
        nav(redirect || "/admin", { replace: true });
      }
    });
    return () => { mounted = false; };
  }, [nav, params]);

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      const profile = await login(v.username, v.password);
      message.success("登录成功");
      const redirect = params.get("redirect");
      // 管理员进后台，抄表员如果有 redirect 就跳（通常是抄表页），否则进后台
      if (redirect) {
        nav(redirect, { replace: true });
      } else if (profile.role === "admin") {
        nav("/admin", { replace: true });
      } else {
        nav("/admin", { replace: true });
      }
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
          <Typography.Text type="secondary">抄表员 / 管理员 登录</Typography.Text>
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
