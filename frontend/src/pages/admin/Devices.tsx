import { useEffect, useState } from "react";
import {
  App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Typography, Tag,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api, errMsg, Device, User } from "../../api";

export default function Devices() {
  const { message } = App.useApp();
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [price, setPrice] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [d, u, p] = await Promise.all([
        api.get("/api/admin/devices"),
        api.get("/api/admin/users"),
        api.get("/api/admin/price"),
      ]);
      setDevices(d.data);
      setUsers(u.data);
      setPrice(p.data.unit_price);
    } catch (e: any) {
      message.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const savePrice = async () => {
    try {
      await api.put("/api/admin/price", { unit_price: price });
      message.success("电单价已更新，后续核算自动生效");
    } catch (e: any) { message.error(errMsg(e)); }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ multiplier: 1.0 });
    setOpen(true);
  };

  const openEdit = (row: Device) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await api.put(`/api/admin/devices/${editing.id}`, v);
        message.success("设备已更新");
      } else {
        await api.post("/api/admin/devices", v);
        message.success("设备已新增");
      }
      setOpen(false);
      load();
    } catch (e: any) { message.error(errMsg(e)); }
  };

  const readerOptions = users.map((u) => ({ label: `${u.full_name}(${u.username})`, value: u.id }));

  const columns = [
    { title: "设备编号", dataIndex: "device_no" },
    { title: "设备名称", dataIndex: "device_name" },
    { title: "电表编号", dataIndex: "meter_no" },
    {
      title: "电表倍率", dataIndex: "multiplier",
      render: (m: number) => <Tag color="blue">{m}</Tag>,
    },
    {
      title: "抄表责任人", dataIndex: "reader_name",
      render: (n: string) => n || <Typography.Text type="danger">未绑定</Typography.Text>,
    },
    {
      title: "操作", key: "act",
      render: (_: any, row: Device) => <Button type="link" onClick={() => openEdit(row)}>编辑</Button>,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="当期电单价（元/度）" size="small">
        <Space>
          <InputNumber min={0} step={0.01} value={price} onChange={(v) => setPrice(v as number)} addonAfter="元/度" />
          <Button type="primary" onClick={savePrice}>保存单价</Button>
          <Typography.Text type="secondary">调整后自动适用于后续所有核算数据</Typography.Text>
        </Space>
      </Card>
      <Card title="设备 / 电表管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增设备</Button>}>
        <Table rowKey="id" loading={loading} dataSource={devices} columns={columns} pagination={false} size="small" />
      </Card>

      <Modal
        title={editing ? "编辑设备" : "新增设备"}
        open={open}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="设备编号" name="device_no" rules={[{ required: true, message: "必填" }]}>
            <Input placeholder="如 DEV-01" />
          </Form.Item>
          <Form.Item label="设备名称" name="device_name" rules={[{ required: true, message: "必填" }]}>
            <Input placeholder="如 生产设备01号" />
          </Form.Item>
          <Form.Item label="电表编号" name="meter_no" rules={[{ required: true, message: "必填" }]}>
            <Input placeholder="如 METER-01" />
          </Form.Item>
          <Form.Item label="电表倍率" name="multiplier" rules={[{ required: true }]}>
            <InputNumber min={0.0001} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="抄表责任人" name="reader_id">
            <Select placeholder="选择绑定账号（一人一码）" options={readerOptions} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
