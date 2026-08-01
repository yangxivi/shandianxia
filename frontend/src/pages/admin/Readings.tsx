import { useEffect, useState } from "react";
import {
  App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Typography,
} from "antd";
import { DeleteOutlined, DownloadOutlined, EditOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import * as XLSX from "xlsx";
import {
  listReadings, listDevices, listProfiles, updateReading, deleteReading,
  Device, Reading, Profile, errMsg,
} from "../../api";
const { RangePicker } = DatePicker;

export default function Readings() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<string>(dayjs().format("YYYY-MM"));
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [meterNo, setMeterNo] = useState<string>("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [readerId, setReaderId] = useState<string | undefined>();

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editRecord, setEditRecord] = useState<Reading | null>(null);
  const [editForm] = Form.useForm();

  let mounted = true;

  const load = async () => {
    setLoading(true);
    try {
      const r = await listReadings({
        month, device_id: deviceId, meter_no: meterNo || undefined,
        reader_id: readerId,
        start: range ? range[0].format("YYYY-MM-DD") : undefined,
        end: range ? range[1].format("YYYY-MM-DD") : undefined,
      });
      if (!mounted) return;
      setRows(r);
    } catch (e: any) {
      const msg = errMsg(e);
      if (msg && mounted) message.error(msg);
    } finally {
      if (mounted) setLoading(false);
    }
  };

  useEffect(() => {
    mounted = true;
    listDevices().then((r) => { if (mounted) setDevices(r); }).catch(() => {});
    listProfiles().then((r) => { if (mounted) setUsers(r); }).catch(() => {});
    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportXlsx = (name: string) => {
    const data = rows.map((r) => ({
      日期: r.read_date, 设备: r.device_no, 电表: r.meter_no,
      昨日读数: r.yesterday_value, 当日读数: r.reading_value, 倍率: r.multiplier,
      每日电量_度: r.daily_kwh, 单价: r.unit_price, 每日电费_元: r.daily_fee,
      抄表人: r.reader_name || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "台账");
    XLSX.writeFile(wb, name);
  };

  const handleEdit = (record: Reading) => {
    setEditRecord(record);
    editForm.setFieldsValue({
      reading_value: record.reading_value,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (v: { reading_value: number }) => {
    if (!editRecord) return;
    setEditLoading(true);
    try {
      await updateReading(editRecord.device_no, editRecord.read_date, v.reading_value);
      message.success("修改成功");
      setEditOpen(false);
      editForm.resetFields();
      load();
    } catch (e: any) {
      const msg = errMsg(e);
      if (msg) message.error(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (record: Reading) => {
    modal.confirm({
      title: "确认删除该抄表记录？",
      content: `日期 ${record.read_date}，设备 ${record.device_no}，读数 ${record.reading_value} 度`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteReading(record.id);
          message.success("已删除");
          load();
        } catch (e: any) {
          const msg = errMsg(e);
          if (msg) message.error(msg);
        }
      },
    });
  };

  const columns = [
    { title: "日期", dataIndex: "read_date", width: 110 },
    { title: "设备", dataIndex: "device_no" },
    { title: "电表", dataIndex: "meter_no" },
    { title: "昨日读数", dataIndex: "yesterday_value" },
    { title: "当日读数", dataIndex: "reading_value" },
    { title: "倍率", dataIndex: "multiplier" },
    { title: "每日电量(度)", dataIndex: "daily_kwh" },
    { title: "单价", dataIndex: "unit_price" },
    { title: "每日电费(元)", dataIndex: "daily_fee" },
    { title: "抄表人", dataIndex: "reader_name" },
    {
      title: "操作",
      key: "action",
      width: 130,
      fixed: "right" as const,
      render: (_: any, record: Reading) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title="抄表台账（每日明细）">
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker picker="month" placeholder="月份" format="YYYY-MM" value={month ? dayjs(month) : null}
          onChange={(d) => setMonth(d ? d.format("YYYY-MM") : "")} />
        <Select placeholder="设备" allowClear style={{ width: 140 }} value={deviceId}
          onChange={setDeviceId} options={devices.map((d) => ({ label: d.device_no, value: d.id }))} />
        <Input placeholder="电表编号" style={{ width: 130 }} value={meterNo} onChange={(e) => setMeterNo(e.target.value)} />
        <Select placeholder="抄表人" allowClear style={{ width: 150 }} value={readerId}
          onChange={setReaderId} options={users.map((u) => ({ label: u.display_name, value: u.id }))} />
        <RangePicker value={range as any} onChange={(v) => setRange(v as any)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
      </Space>
      <Space style={{ marginBottom: 12, float: "right" }}>
        <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(`每日明细_${month}.xlsx`)}>
          导出 Excel
        </Button>
      </Space>
      <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} size="small"
        scroll={{ x: 1100 }} pagination={{ pageSize: 15 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        筛选支持按设备、电表编号、日期区间、月份、抄表人精准查询；导出在浏览器端生成 .xlsx。管理员可编辑和删除记录。
      </Typography.Paragraph>

      <Modal
        title="编辑抄表记录"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          设备：{editRecord?.device_no}　日期：{editRecord?.read_date}
        </Typography.Paragraph>
        <Form form={editForm} onFinish={handleEditSubmit} size="large">
          <Form.Item
            label="当日电表读数"
            name="reading_value"
            rules={[
              { required: true, message: "请填写读数" },
              { type: "number", min: 0.0001, message: "读数必须为正数" },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} addonAfter="度" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={editLoading}>
            确认修改
          </Button>
        </Form>
      </Modal>
    </Card>
  );
}
