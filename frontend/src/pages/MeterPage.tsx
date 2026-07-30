import { useEffect, useState } from "react";
import {
  Alert, App, Button, Card, Descriptions, Form, InputNumber, Result, Spin, Typography,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import { fetchDeviceInfo, submitReading, errMsg } from "../api";

interface DeviceInfo {
  device_no: string;
  device_name: string;
  meter_no: string;
  reader_name: string | null;
  yesterday_reading: number | null;
}

export default function MeterPage() {
  const [params] = useSearchParams();
  const deviceNo = (params.get("device") || params.get("token") || "").toUpperCase();
  const { message } = App.useApp();
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ kwh: number; fee: number; date: string } | null>(null);
  const [form] = Form.useForm();
  const readingValue = Form.useWatch("reading_value", form);

  // 实时校验：今日读数低于昨日读数时直接拦截（前端先期拦截，服务端再兜底）
  const belowYesterday =
    info?.yesterday_reading != null &&
    readingValue != null &&
    readingValue < info.yesterday_reading;

  useEffect(() => {
    if (!deviceNo) {
      setLoading(false);
      return;
    }
    fetchDeviceInfo(deviceNo)
      .then((d) => setInfo(d))
      .catch((e) => message.error(errMsg(e)))
      .finally(() => setLoading(false));
  }, [deviceNo]);

  const onFinish = async (v: { reading_value: number }) => {
    setSubmitting(true);
    try {
      const r = await submitReading(deviceNo, v.reading_value);
      setDone({ kwh: r.daily_kwh, fee: r.daily_fee, date: r.read_date });
      message.success("抄表成功，数据已同步后台");
    } catch (e: any) {
      // 重复填报 / 异常拦截 等均在此提示
      message.error(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin tip="正在解析二维码…" />
      </div>
    );
  }

  if (!deviceNo) {
    return <Result status="warning" title="无效的二维码" subTitle="请扫描电表专属二维码进入抄表页面。" />;
  }

  const today = new Date().toISOString().slice(0, 10);

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Result
          status="success"
          title="当日抄表已完成"
          subTitle={`日期 ${done.date}　每日电量 ${done.kwh} 度　每日电费 ${done.fee} 元`}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", padding: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        <ThunderboltOutlined style={{ fontSize: 36, color: "#1677ff" }} />
        <Typography.Title level={4} style={{ margin: "8px 0 0" }}>电表每日抄表</Typography.Title>
        <Typography.Text type="secondary">一人一码 · 系统自动核算</Typography.Text>
      </div>
      <Card style={{ width: "100%", maxWidth: 460 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="填报日期">{today}（系统自动）</Descriptions.Item>
          <Descriptions.Item label="设备编号">{info?.device_no}</Descriptions.Item>
          <Descriptions.Item label="设备名称">{info?.device_name}</Descriptions.Item>
          <Descriptions.Item label="电表编号">{info?.meter_no}</Descriptions.Item>
          <Descriptions.Item label="抄表责任人">{info?.reader_name || "未绑定"}</Descriptions.Item>
          <Descriptions.Item label="昨日读数">
            {info?.yesterday_reading != null ? `${info.yesterday_reading} 度` : "暂无（首次抄表）"}
          </Descriptions.Item>
        </Descriptions>

        <Form form={form} onFinish={onFinish} style={{ marginTop: 20 }} size="large">
          <Form.Item
            label="当日电表读数"
            name="reading_value"
            rules={[
              { required: true, message: "请填写当日读数" },
              { type: "number", min: 0.0001, message: "读数必须为正数" },
              {
                validator: (_, val) =>
                  info?.yesterday_reading != null &&
                  val != null &&
                  val < info.yesterday_reading
                    ? Promise.reject(new Error("当日读数低于昨日读数，请核对电表数据"))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="请实地抄表后填写"
              min={0}
              step={0.01}
              precision={2}
              addonAfter="度"
            />
          </Form.Item>

          {belowYesterday && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="当日读数低于昨日读数"
              description="读数倒走不符合常理，请核对电表实际读数确认无误后再提交。"
            />
          )}

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={submitting}
            disabled={belowYesterday}
          >
            保存并提交
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          提示：同一电表当日仅可填报一次；若读数低于昨日将自动拦截，请核对电表。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
