import { useEffect, useState } from "react";
import {
  App, Button, Card, DatePicker, Input, Select, Space, Table, Typography,
} from "antd";
import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import * as XLSX from "xlsx";
import { listReadings, listDevices, listProfiles, Device, Reading, Profile, errMsg } from "../../api";

const { RangePicker } = DatePicker;

export default function Readings() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<string>(dayjs().format("YYYY-MM"));
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [meterNo, setMeterNo] = useState<string>("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [readerId, setReaderId] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      const r = await listReadings({
        month,
        device_id: deviceId,
        meter_no: meterNo || undefined,
        reader_id: readerId,
        start: range ? range[0].format("YYYY-MM-DD") : undefined,
        end: range ? range[1].format("YYYY-MM-DD") : undefined,
      });
      setRows(r);
    } catch (e: any) { message.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    listDevices().then(setDevices).catch(() => {});
    listProfiles().then(setUsers).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportXlsx = (name: string) => {
    const data = rows.map((r) => ({
      日期: r.read_date,
      设备: r.device_no,
      电表: r.meter_no,
      昨日读数: r.yesterday_value,
      当日读数: r.reading_value,
      倍率: r.multiplier,
      每日电量_度: r.daily_kwh,
      单价: r.unit_price,
      每日电费_元: r.daily_fee,
      抄表人: r.reader_name || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "台账");
    XLSX.writeFile(wb, name);
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
        scroll={{ x: 900 }} pagination={{ pageSize: 15 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        筛选支持按设备、电表编号、日期区间、月份、抄表人精准查询；导出在浏览器端生成 .xlsx。
      </Typography.Paragraph>
    </Card>
  );
}
