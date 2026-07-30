import { useEffect, useState } from "react";
import {
  App, Button, Card, DatePicker, Input, Select, Space, Table, Typography,
} from "antd";
import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { api, errMsg, Device, Reading, User } from "../../api";

const { RangePicker } = DatePicker;

export default function Readings() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<string>(dayjs().format("YYYY-MM"));
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const [meterNo, setMeterNo] = useState<string>("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [readerId, setReaderId] = useState<number | undefined>();

  const load = async () => {
    setLoading(true);
    const params: any = { month };
    if (deviceId) params.device_id = deviceId;
    if (meterNo) params.meter_no = meterNo;
    if (readerId) params.reader_id = readerId;
    if (range) {
      params.start = range[0].format("YYYY-MM-DD");
      params.end = range[1].format("YYYY-MM-DD");
    }
    try {
      const r = await api.get("/api/admin/readings", { params });
      setRows(r.data);
    } catch (e: any) { message.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    api.get("/api/admin/devices").then((r) => setDevices(r.data)).catch(() => {});
    api.get("/api/admin/users").then((r) => setUsers(r.data)).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async (url: string, filename: string) => {
    try {
      const r = await api.get(url, { params: buildParams(), responseType: "blob" });
      const blob = new Blob([r.data]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { message.error(errMsg(e)); }
  };

  const buildParams = () => {
    const p: any = { month };
    if (deviceId) p.device_id = deviceId;
    if (meterNo) p.meter_no = meterNo;
    if (readerId) p.reader_id = readerId;
    if (range) { p.start = range[0].format("YYYY-MM-DD"); p.end = range[1].format("YYYY-MM-DD"); }
    return p;
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
  ];

  return (
    <Card title="抄表台账（每日明细）">
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker picker="month" placeholder="月份" value={month ? dayjs(month) : null}
          onChange={(d) => setMonth(d ? d.format("YYYY-MM") : "")} />
        <Select placeholder="设备" allowClear style={{ width: 140 }} value={deviceId}
          onChange={setDeviceId} options={devices.map((d) => ({ label: d.device_no, value: d.id }))} />
        <Input placeholder="电表编号" style={{ width: 130 }} value={meterNo} onChange={(e) => setMeterNo(e.target.value)} />
        <Select placeholder="抄表人" allowClear style={{ width: 150 }} value={readerId}
          onChange={setReaderId} options={users.map((u) => ({ label: u.full_name, value: u.id }))} />
        <RangePicker value={range as any} onChange={(v) => setRange(v as any)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
      </Space>
      <Space style={{ marginBottom: 12, float: "right" }}>
        <Button icon={<DownloadOutlined />} onClick={() => download("/api/admin/export/daily", `每日明细_${month}.xlsx`)}>
          导出每日明细
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => download(`/api/admin/export/monthly?month=${month}`, `月度汇总_${month}.xlsx`)}>
          导出月度汇总
        </Button>
      </Space>
      <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} size="small"
        scroll={{ x: 900 }} pagination={{ pageSize: 15 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        筛选支持按设备、电表编号、日期区间、月份、抄表人精准查询。
      </Typography.Paragraph>
    </Card>
  );
}
