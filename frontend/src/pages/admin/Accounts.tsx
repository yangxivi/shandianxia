import { useEffect, useState } from "react";
import {
  App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { listProfiles, updateProfile, deleteProfile, register, Profile, errMsg } from "../../api";

export default function Accounts() {
  const { message } = App.useApp();
  const [data, setData] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const list = await listProfiles();
      setData(list);
    } catch (e: any) {
      message.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── 新增账号（调用 supabase.auth.signUp）──
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "reader" });
    setCreating(true);
    setOpen(true);
  };

  // ── 编辑账号（修改 display_name / role）──
  const openEdit = (row: Profile) => {
    setEditing(row);
    form.setFieldsValue({
      display_name: row.display_name,
      role: row.role,
    });
    setCreating(false);
    setOpen(true);
  };

  const submit = async () => {
    if (creating) {
      // 新增：走 signUp 注册流程
      const v = await form.validateFields();
      try {
        await register(v.username, v.password, v.display_name || v.username, v.role || "reader");
        message.success(`账号 ${v.username} 已创建`);
        setOpen(false);
        load();
      } catch (e: any) {
        message.error(errMsg(e));
      }
    } else {
      // 编辑：走 RPC 更新 profile
      const v = await form.validateFields();
      try {
        await updateProfile(editing!.id, {
          display_name: v.display_name,
          role: v.role,
        });
        message.success("账号已更新");
        setOpen(false);
        load();
      } catch (e: any) {
        message.error(errMsg(e));
      }
    }
  };

  // ── 删除账号 ──
  const handleDelete = async (row: Profile) => {
    try {
      await deleteProfile(row.id);
      message.success(`账号 ${row.username} 已删除`);
      load();
    } catch (e: any) {
      message.error(errMsg(e));
    }
  };

  const columns = [
    { title: "用户名", dataIndex: "username" },
    { title: "显示名称", dataIndex: "display_name" },
    {
      title: "角色", dataIndex: "role",
      render: (r: string) =>
        r === "admin"
          ? <Tag color="red">管理员</Tag>
          : <Tag color="blue">抄表员</Tag>,
    },
    {
      title: "操作", key: "act",
      width: 180,
      render: (_: any, row: Profile) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Popconfirm
            title="确认删除该账号？"
            description={`删除后该用户将无法登录，且不可恢复。${row.role === 'admin' ? '⚠️ 此为管理员账号！' : ''}`}
            onConfirm={() => handleDelete(row)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="抄表员 / 管理员 账号管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增账号</Button>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 新增 / 编辑 弹窗 */}
      <Modal
        title={creating ? "新增账号" : "编辑账号"}
        open={open}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnClose
        okText={creating ? "创建账号" : "保存修改"}
      >
        <Form form={form} layout="vertical">
          {creating && (
            <>
              <Form.Item label="用户名" name="username" rules={[
                { required: true, message: "请输入用户名（用于登录）" },
                { pattern: /^[a-zA-Z0-9_]+$/, message: "仅支持字母、数字、下划线" },
              ]}>
                <Input placeholder="如 reader31" />
              </Form.Item>
              <Form.Item label="初始密码" name="password" rules={[
                { required: true, message: "请输入初始密码" },
                { min: 6, message: "密码至少6位" },
              ]}>
                <Input.Password placeholder="至少6位" />
              </Form.Item>
            </>
          )}
          <Form.Item label="显示名称" name="display_name" rules={[{ required: true, message: "请输入显示名称" }]}>
            <Input placeholder="如 张三" />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "admin", label: "管理员（可管理全部功能）" },
                { value: "reader", label: "抄表员（仅可扫码填报）" },
              ]}
            />
          </Form.Item>
          {!creating && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：编辑模式下不可修改用户名和密码。如需重置密码请联系系统管理员通过 Supabase 控制台操作。
            </Typography.Text>
          )}
        </Form>
      </Modal>
    </Space>
  );
}
