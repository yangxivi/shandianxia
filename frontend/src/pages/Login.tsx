import { useState } from "react";
import { Button, Card, Form, Input, Typography, App, Divider } from "antd";
import { ThunderboltOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { login, register, errMsg } from "../api";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const nav = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [regForm] = Form.useForm();

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.username, v.password);
      message.success("登录成功");
      nav("/admin");
    } catch (e: any) {
      message.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (v: { username: string; password: string; display_name: string; role: string }) => {
    try {
      await register(v.username, v.password, v.display_name, v.role);
      message.success("注册成功，请用新账号登录（若需管理员权限请联系已有的管理员）");
      setRegOpen(false);
      regForm.resetFields();
    } catch (e: any) {
      message.error(errMsg(e));
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
        <Divider plain style={{ fontSize: 12 }}>或</Divider>
        <Button block onClick={() => setRegOpen(true)}>注册新账号</Button>
      </Card>

      <Card title="注册新账号" style={{ width: 360, marginTop: 16, display: regOpen ? "block" : "none" }}>
        <Form form={regForm} onFinish={onRegister} size="large" layout="vertical">
          <Form.Item label="账号" name="username" rules={[{ required: true, message: "必填" }]}>
            <Input placeholder="如 reader31" />
          </Form.Item>
          <Form.Item label="姓名" name="display_name" rules={[{ required: true, message: "必填" }]}>
            <Input placeholder="如 抄表员31" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="角色" name="role" initialValue="reader">
            <Input value="reader" disabled />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>提交注册</Button>
        </Form>
      </Card>
    </div>
  );
}
