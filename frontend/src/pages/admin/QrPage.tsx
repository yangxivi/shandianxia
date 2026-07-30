import { useEffect, useState } from "react";
import { App, Button, Card, Empty, Space, Typography } from "antd";
import { DownloadOutlined, PrinterOutlined } from "@ant-design/icons";
import QRCode from "qrcode";
import { listDevices, Device, errMsg } from "../../api";
import { PUBLIC_BASE_URL } from "../../lib/supabase";

export default function QrPage() {
  const { message } = App.useApp();
  const [devices, setDevices] = useState<Device[]>([]);
  const [imgs, setImgs] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const r = await listDevices();
      setDevices(r);
      const map: Record<string, string> = {};
      await Promise.all(
        r.map(async (d: Device) => {
          const url = `${PUBLIC_BASE_URL}meter?device=${d.device_no}`;
          map[d.id] = await QRCode.toDataURL(url, { width: 240, margin: 1 });
        })
      );
      setImgs(map);
    } catch (e: any) { message.error(errMsg(e)); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <Card title="电表专属二维码（一设备一码，长期有效）">
      {devices.length === 0 && <Empty description="暂无设备" />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {devices.map((d) => (
          <Card key={d.id} size="small" style={{ width: 220, textAlign: "center" }} title={`${d.device_no} · ${d.device_name}`}>
            {imgs[d.id] ? (
              <img src={imgs[d.id]} alt={d.device_no} style={{ width: 160, height: 160 }} />
            ) : (
              <div style={{ height: 160, lineHeight: "160px" }}>加载中…</div>
            )}
            <Typography.Paragraph style={{ margin: "8px 0", fontSize: 12 }}>
              电表 {d.meter_no}　责任人 {d.reader_name || "未绑定"}
            </Typography.Paragraph>
            <Space>
              <Button size="small" icon={<DownloadOutlined />}
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = imgs[d.id];
                  a.download = `QR_${d.device_no}.png`;
                  a.click();
                }}>下载</Button>
              <Button size="small" icon={<PrinterOutlined />}
                onClick={() => { const w = window.open(imgs[d.id]); w?.print(); }}>打印</Button>
            </Space>
          </Card>
        ))}
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
        将二维码张贴于对应设备旁，责任人每日扫描同一固定二维码即可完成当日抄表；二维码长期有效，无需每日更新。
      </Typography.Paragraph>
    </Card>
  );
}
