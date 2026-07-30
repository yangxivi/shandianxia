import { useEffect, useState } from "react";
import {
  App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography, Tag,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { listDevices, listProfiles, getPrice, setPrice, createDevice, deleteDevice, Device, Profile, errMsg } from "../../api";

export default function Devices() {
  const { message } = App.useApp();
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [price, setPriceVal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [d, u, p] = await Promise.all([listDevices(), listProfiles(), getPrice()]);
      setDevices(d);
      setUsers(u);
      setPriceVal(Number(p));
    } catch (e: any) {
      message.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const savePrice = async () => {
    try {
      await setPrice(String(price));
      message.success("电单价已更新，所有历史记录的单价与电费已同步重算");
    } catch (e: any) { message.error(errMsg(e)); }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ multiplier: 1.0 });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await createDevice(v);
      message.success("设备已新增");
      setOpen(false);
      load();
    } catch (e: any) { message.error(errMsg(e)); }
  };

  // ── 批量删除 ──
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      for (const id of selectedRowKeys) {
        await deleteDevice(id as string);
      }
      message.success(`已删除 ${selectedRowKeys.length} 台设备`);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) {
      message.error(errMsg(e));
    }
  };

  const readerOptions = users.map((u) => ({ label: `${u.display_name}(${u.username})`, value: u.id }));

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
  ];

  // 多选配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="当期电单价（元/度）" size="small">
        <Space>
          <InputNumber min={0} step={0.01} value={price} onChange={(v) => setPriceVal(v as number)} addonAfter="元/度" />
          <Button type="primary" onClick={savePrice}>保存单价</Button>
          <Typography.Text type="secondary">调整后所有历史抄表记录的单价与电费将同步更新</Typography.Text>
        </Space>
      </Card>

      <Card
        title="设备 / 电表管理"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增设备</Button>
            <Popconfirm
              title={`确认删除选中的 ${selectedRowKeys.length} 台设备？`}
              description="删除后关联的抄表记录也将被级联清除，不可恢复。"
              onConfirm={handleBatchDelete}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={selectedRowKeys.length === 0}
            >
              <Button danger icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0}>
                删除选中 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={devices}
          columns={columns}
          pagination={false}
          size="small"
          rowSelection={rowSelection}
        />
      </Card>

      <Modal
        title="新增设备"
        open={open}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnClose
        okText="创建"
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
