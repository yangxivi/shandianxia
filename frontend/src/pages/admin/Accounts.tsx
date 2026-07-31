import { useEffect, useState } from "react";
import {
  App, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag,
} from "antd";
import { PlusOutlined, DeleteOutlined, TeamOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { listProfiles, updateProfile, deleteProfile, register, resetPassword, batchUpdateProfileRole, Profile, errMsg } from "../../api";

export default function Accounts() {
  const { message, modal } = App.useApp();
  const [data, setData] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchRoleOpen, setBatchRoleOpen] = useState(false);
  const [batchRoleValue, setBatchRoleValue] = useState<string>("reader");
  const [batchRoleLoading, setBatchRoleLoading] = useState(false);
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

  // ── 新增账号 ──
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "reader" });
    setCreating(true);
    setOpen(true);
  };

  // ── 编辑账号 ──
  const openEdit = (row: Profile) => {
    setEditing(row);
    form.setFieldsValue({
      display_name: row.display_name,
      role: row.role,
      new_password: undefined,
    });
    setCreating(false);
    setOpen(true);
  };

  const submit = async () => {
    if (creating) {
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
      const v = await form.validateFields();
      try {
        await updateProfile(editing!.id, {
          display_name: v.display_name,
          role: v.role,
        });
        if (v.new_password && v.new_password.trim()) {
          await resetPassword(editing!.id, v.new_password.trim());
          message.success("账号已更新，密码已重置");
        } else {
          message.success("账号已更新");
        }
        setOpen(false);
        load();
      } catch (e: any) {
        message.error(errMsg(e));
      }
    }
  };

  // ── 单条删除 ──
  const handleDelete = async (row: Profile) => {
    try {
      await deleteProfile(row.id);
      message.success(`账号 ${row.username} 已删除`);
      setSelectedRowKeys(keys => keys.filter(k => k !== row.id));
      load();
    } catch (e: any) {
      message.error(errMsg(e));
    }
  };

  // ── 批量删除 ──
  const handleBatchDelete = async () => {
    const count = selectedRowKeys.length;
    if (count === 0) return;

    modal.confirm({
      title: (
        <span>
          <ExclamationCircleOutlined style={{ color: "#ff4d4f", marginRight: 8 }} />
          确认删除选中的 {count} 个账号？
        </span>
      ),
      content: (
        <div>
          <p>删除后这些用户将无法登录，且不可恢复。</p>
          <p style={{ color: "#ff4d4f", marginBottom: 0 }}>
            ⚠️ 包含管理员账号或已绑定设备的账号将会跳过并提示。
          </p>
        </div>
      ),
      okText: "确认批量删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBatchDeleting(true);
        const ids = [...selectedRowKeys];
        const failed: string[] = [];
        const succeeded: string[] = [];

        await Promise.all(
          ids.map(async (key) => {
            const id = String(key);
            try {
              await deleteProfile(id);
              succeeded.push(id);
            } catch {
              failed.push(id);
            }
          })
        );

        setBatchDeleting(false);
        if (succeeded.length > 0) {
          message.success(`成功删除 ${succeeded.length} 个账号`);
        }
        if (failed.length > 0) {
          const failedNames = data
            .filter(d => failed.includes(d.id))
            .map(d => d.username)
            .join("、");
          message.warning({
            content: `以下 ${failed.length} 个账号删除失败（可能是管理员或已绑定设备）：${failedNames}`,
            duration: 6,
          });
        }
        setSelectedRowKeys([]);
        load();
      },
    });
  };

  // ── 打开批量修改角色弹窗 ──
  const openBatchRole = () => {
    if (selectedRowKeys.length === 0) return;
    const selected = data.find(d => d.id === selectedRowKeys[0]);
    setBatchRoleValue(selected?.role || "reader");
    setBatchRoleOpen(true);
  };

  // ── 执行批量修改角色 ──
  const handleBatchRoleSubmit = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchRoleLoading(true);
    const targetRole = batchRoleValue;
    const ids = [...selectedRowKeys];
    const failed: string[] = [];
    const succeeded: string[] = [];

    await Promise.all(
      ids.map(async (key) => {
        const id = String(key);
        const profile = data.find(d => d.id === id);
        if (!profile) { failed.push(id); return; }
        try {
          await updateProfile(id, { display_name: profile.display_name, role: targetRole });
          succeeded.push(id);
        } catch {
          failed.push(id);
        }
      })
    );

    setBatchRoleLoading(false);
    setBatchRoleOpen(false);
    const roleLabel = targetRole === "admin" ? "管理员" : "抄表员";
    if (succeeded.length > 0) {
      message.success(`成功将 ${succeeded.length} 个账号角色修改为「${roleLabel}」`);
    }
    if (failed.length > 0) {
      const failedNames = data
        .filter(d => failed.includes(d.id))
        .map(d => d.username)
        .join("、");
      message.warning({
        content: `以下 ${failed.length} 个账号修改失败：${failedNames}`,
        duration: 6,
      });
    }
    setSelectedRowKeys([]);
    load();
  };

  const columns = [
    {
      title: (
        <Checkbox
          checked={data.length > 0 && selectedRowKeys.length === data.length}
          indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < data.length}
          onChange={(e) => setSelectedRowKeys(e.target.checked ? data.map(d => d.id) : [])}
        />
      ),
      key: "select",
      width: 48,
      render: (_: any, row: Profile) => (
        <Checkbox
          checked={selectedRowKeys.includes(row.id)}
          onChange={(e) => {
            setSelectedRowKeys(keys =>
              e.target.checked ? [...keys, row.id] : keys.filter(k => k !== row.id)
            );
          }}
        />
      ),
    },
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
        extra={
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Button
                  icon={<TeamOutlined />}
                  onClick={openBatchRole}
                >
                  批量修改角色 ({selectedRowKeys.length})
                </Button>
                <Popconfirm
                  title={`确认删除选中的 ${selectedRowKeys.length} 个账号？`}
                  description="此操作不可恢复。"
                  onConfirm={handleBatchDelete}
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />} loading={batchDeleting}>
                    批量删除 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增账号</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={false}
          size="small"
        />
        {selectedRowKeys.length > 0 && (
          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
            已选中 <strong style={{ color: "#1677ff" }}>{selectedRowKeys.length}</strong> / {data.length} 项
            <Button
              type="link"
              size="small"
              onClick={() => setSelectedRowKeys([])}
              style={{ marginLeft: 8 }}
            >
              取消选择
            </Button>
          </div>
        )}
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
            <Form.Item
              label="重置密码"
              name="new_password"
              rules={[
                { min: 6, message: "密码至少6位" },
              ]}
              extra="留空表示不修改密码；填写后将覆盖原密码。"
            >
              <Input.Password placeholder="留空不修改，填写则重置为新密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 批量修改角色弹窗 */}
      <Modal
        title="批量修改角色"
        open={batchRoleOpen}
        confirmLoading={batchRoleLoading}
        onOk={handleBatchRoleSubmit}
        onCancel={() => setBatchRoleOpen(false)}
        okText="确认修改"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label={`将选中的 ${selectedRowKeys.length} 个账号角色统一修改为：`}>
            <Select
              value={batchRoleValue}
              onChange={setBatchRoleValue}
              options={[
                { value: "admin", label: "管理员（可管理全部功能）" },
                { value: "reader", label: "抄表员（仅可扫码填报）" },
              ]}
            />
          </Form.Item>
          <div style={{ color: "#666", fontSize: 13 }}>
            ⚠️ 将管理员降级为抄表员不会清理已有数据，但该账号将无法访问管理后台。
          </div>
        </Form>
      </Modal>
    </Space>
  );
}
