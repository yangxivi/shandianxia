import { useEffect, useState } from "react";
import { App, Button, Card, Col, DatePicker, Row, Statistic, Table, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { monthlySummary, MonthlyItem, errMsg } from "../../api";

export default function Summary() {
  const { message } = App.useApp();
  const [month, setMonth] = useState<string>(dayjs().format("YYYY-MM"));
  const [data, setData] = useState<{ devices: MonthlyItem[]; total_kwh: number; total_fee: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!month) return;
    setLoading(true);
    try {
      const r = await monthlySummary(month);
      setData(r);
    } catch (e: any) { message.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const download = () => {
    const rows = (data?.devices || []).map((d) => ({
      设备编号: d.device_no,
      设备名称: d.device_name,
      电表编号: d.meter_no,
      月度总电量_度: d.total_kwh,
      月度总电费_元: d.total_fee,
    }));
    rows.push({ 设备编号: "全厂合计", 设备名称: "", 电表编号: "", 月度总电量_度: data?.total_kwh ?? 0, 月度总电费_元: data?.total_fee ?? 0 });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "月度汇总");
    XLSX.writeFile(wb, `月度汇总_${month}.xlsx`);
  };

  const columns = [
    { title: "设备编号", dataIndex: "device_no" },
    { title: "设备名称", dataIndex: "device_name" },
    { title: "电表编号", dataIndex: "meter_no" },
    { title: "月度总电量(度)", dataIndex: "total_kwh" },
    { title: "月度总电费(元)", dataIndex: "total_fee" },
  ];

  return (
    <Card title="月度汇总统计">
      <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <DatePicker picker="month" value={dayjs(month)} onChange={(d) => setMonth(d ? d.format("YYYY-MM") : "")} />
        </Col>
        <Col>
          <Button type="primary" onClick={load}>统计</Button>
        </Col>
        <Col flex="auto" />
        <Col>
          <Button icon={<DownloadOutlined />} onClick={download}>导出 Excel</Button>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <Statistic title={`${month} 全厂总电量`} value={data?.total_kwh ?? 0} suffix="度" precision={2} />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <Statistic title={`${month} 全厂总电费`} value={data?.total_fee ?? 0} prefix="¥" precision={2} valueStyle={{ color: "#cf1322" }} />
          </Card>
        </Col>
      </Row>
      <Table rowKey="device_no" loading={loading} dataSource={data?.devices || []} columns={columns} size="small" pagination={false} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
        系统按自然月自动汇总每台设备月度总用电量、总电费，并给出全厂整体汇总。
      </Typography.Paragraph>
    </Card>
  );
}
