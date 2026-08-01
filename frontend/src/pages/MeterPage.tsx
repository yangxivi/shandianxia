import { useEffect, useMemo, useState } from "react";
import {
  Alert, App, Button, Card, Descriptions, Form, InputNumber, Modal, Result, Spin, Table, Tag, Typography,
} from "antd";
import { ThunderboltOutlined, EditOutlined, LogoutOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchDeviceInfo, submitReading, updateReading, errMsg, logout, type DeviceInfo, type RecentReading } from "../api";
import { supabase } from "../lib/supabase";

export default function MeterPage() {
  const [params] = useSearchParams();
  const deviceNo = (params.get("device") || params.get("token") || "").toUpperCase();
  const { message, modal } = App.useApp();
  const nav = useNavigate();
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ kwh: number; fee: number; date: string } | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>("");
  const [permError, setPermError] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();
  const [form] = Form.useForm();
  const readingValue = Form.useWatch("reading_value", form);

  const today = useMemo(
    () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    []
  );

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (timer) { clearTimeout(timer); timer = null; }
        setAuthed(!!data.session);
      } catch (e: any) {
        if (!mounted) return;
        if (timer) { clearTimeout(timer); timer = null; }
        const msg = errMsg(e);
        setAuthError(msg || "登录状态检查失败");
        setAuthed(false);
      }
    };
    check();
    timer = setTimeout(() => {
      if (mounted) {
        setAuthError("网络连接超时，请检查网络后重试");
        setAuthed(false);
      }
    }, 5000);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      if (timer) { clearTimeout(timer); timer = null; }
      setAuthed(!!s);
    });
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authed !== true || !deviceNo) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setPermError("");
    fetchDeviceInfo(deviceNo)
      .then((d) => { if (mounted) setInfo(d); })
      .catch((e) => {
        const msg = errMsg(e);
        if (!mounted) return;
        if (msg?.includes("责任人") || msg?.includes("无法填报") || msg?.includes("无法修改")) {
          setPermError(msg);
        } else if (msg?.includes("登录") || msg?.includes("未登录")) {
          setAuthed(false);
        } else if (msg) {
          message.error(msg);
        }
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [authed, deviceNo]);

  const handleLogout = () => {
    modal.confirm({
      title: "确认退出登录？",
      okText: "退出",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await logout();
        message.success("已退出登录");
        nav("/login", { replace: true });
      },
    });
  };

  const onFinish = async (v: { reading_value: number }) => {
    setSubmitting(true);
    try {
      const r = await submitReading(deviceNo, v.reading_value);
      setDone({ kwh: r.daily_kwh, fee: r.daily_fee, date: r.read_date });
      if (r.auto_filled_days && r.auto_filled_days > 0) {
        message.success(`抄表成功，已自动补填 ${r.auto_filled_days} 天漏填记录`);
      } else {
        message.success("抄表成功，数据已同步后台");
      }
    } catch (e: any) {
      const msg = errMsg(e);
      if (msg) message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onEditSubmit = async (v: { reading_value: number }) => {
    setEditLoading(true);
    try {
      const r = await updateReading(deviceNo, today, v.reading_value);
      message.success(`修改成功，还可修改 ${r.remaining_edits} 次`);
      setEditOpen(false);
      editForm.resetFields();
      setLoading(true);
      const d = await fetchDeviceInfo(deviceNo);
      setInfo(d);
      setDone({ kwh: r.daily_kwh, fee: r.daily_fee, date: r.read_date });
    } catch (e: any) {
      const msg = errMsg(e);
      if (msg) message.error(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const historyData = useMemo(() => {
    if (!info?.recent_readings) return [];
    return [...info.recent_readings].sort((a, b) => b.read_date.localeCompare(a.read_date));
  }, [info?.recent_readings]);

  const remainingEdits = info ? info.max_edits - (info.today_edit_count || 0) : 0;
  const canEdit = info?.today_submitted && remainingEdits > 0;

  if (authed === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin tip="检查登录状态…" />
      </div>
    );
  }

  if (authed === false) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#f0f2f5" }}>
        <Card style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: "#1677ff" }} />
          <Typography.Title level={4} style={{ marginTop: 16 }}>请先登录</Typography.Title>
          <Typography.Paragraph type="secondary">
            抄表页需要抄表员账号密码登录后才能填写
          </Typography.Paragraph>
          {authError && (
            <Alert
              type="error"
              showIcon
              message={authError}
              style={{ marginBottom: 16, textAlign: "left" }}
            />
          )}
          <Button type="primary" size="large" block onClick={() => {
            const redirect = encodeURIComponent(window.location.pathname + window.location.search);
            nav(`/login?redirect=${redirect}`, { replace: true });
          }}>
            去登录
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin tip="正在加载设备信息…" />
      </div>
    );
  }

  if (!deviceNo) {
    return <Result status="warning" title="无效的二维码" subTitle="请扫描电表专属二维码进入抄表页面。" />;
  }

  if (permError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#f0f2f5" }}>
        <Card style={{ width: "100%", maxWidth: 420 }}>
          <Result
            status="warning"
            icon={<ThunderboltOutlined style={{ color: "#faad14" }} />}
            title="无此设备操作权限"
            subTitle={permError}
          />
          <Alert
            type="info"
            showIcon
            message="说明"
            description="每台电表已绑定专属抄表员账号，您只能使用自己账号所绑定的电表二维码进行抄表。如账号绑定有误，请联系管理员在后台调整。"
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button onClick={handleLogout}>切换账号</Button>
            <Button type="primary" onClick={() => { setPermError(""); setLoading(true); fetchDeviceInfo(deviceNo).then((d) => setInfo(d)).catch(() => {}).finally(() => setLoading(false)); }}>
              重新尝试
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f2f5", padding: 16 }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <div style={{ textAlign: "right", marginBottom: 8 }}>
            <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
          </div>
          <Result
            status="success"
            title="当日抄表已完成"
            subTitle={`日期 ${done.date}　每日电量 ${done.kwh} 度　每日电费 ${done.fee} 元`}
            extra={
              canEdit ? [
                <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => {
                  const todayReading = info?.recent_readings?.find(r => r.read_date === today)?.reading_value;
                  if (todayReading) editForm.setFieldsValue({ reading_value: todayReading });
                  setEditOpen(true);
                }}>
                  修改今日读数（剩余 {remainingEdits} 次）
                </Button>,
              ] : info?.today_submitted && remainingEdits === 0 ? [
                <Tag key="noedit" color="default">修改次数已用完</Tag>,
              ] : undefined
            }
          />
          <Card title="近七日读数" size="small" style={{ marginTop: 16 }}>
            <Table
              dataSource={historyData}
              rowKey="read_date"
              size="small"
              pagination={false}
              columns={[
                { title: "日期", dataIndex: "read_date", key: "date", width: "50%" },
                {
                  title: "抄表读数（度）",
                  dataIndex: "reading_value",
                  key: "value",
                  width: "50%",
                  render: (v: number, r: RecentReading) => (
                    <span>
                      {Number(v).toFixed(2)}
                      {r.is_auto_filled && <Tag style={{ marginLeft: 6 }} color="default">自动补填</Tag>}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </div>
        <Modal
          title="修改今日读数"
          open={editOpen}
          onCancel={() => setEditOpen(false)}
          footer={null}
          destroyOnClose
        >
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            剩余可修改次数：<b>{remainingEdits}</b> 次
          </Typography.Paragraph>
          <Form form={editForm} onFinish={onEditSubmit} size="large">
            <Form.Item
              label="今日电表读数"
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
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", padding: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 460, textAlign: "right", marginBottom: 8 }}>
        <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
      </div>

      <div style={{ textAlign: "center", margin: "8px 0 16px" }}>
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
        </Descriptions>

        <Form form={form} onFinish={onFinish} style={{ marginTop: 20 }} size="large">
          <Form.Item
            label="当日电表读数"
            name="reading_value"
            rules={[
              { required: true, message: "请填写当日读数" },
              { type: "number", min: 0.0001, message: "读数必须为正数" },
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
          <Button type="primary" htmlType="submit" block loading={submitting}>
            保存并提交
          </Button>
        </Form>

        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          提示：同一电表当日仅可填报一次，填报后最多可修改 2 次。
        </Typography.Paragraph>
      </Card>

      <Card title="近七日读数" size="small" style={{ width: "100%", maxWidth: 460, marginTop: 16 }}>
        <Table
          dataSource={historyData}
          rowKey="read_date"
          size="small"
          pagination={false}
          locale={{ emptyText: "暂无历史数据" }}
          columns={[
            { title: "日期", dataIndex: "read_date", key: "date", width: "50%" },
            {
              title: "抄表读数（度）",
              dataIndex: "reading_value",
              key: "value",
              width: "50%",
              render: (v: number, r: RecentReading) => (
                <span>
                  {v != null ? Number(v).toFixed(2) : "—"}
                  {r.is_auto_filled && <Tag style={{ marginLeft: 6 }} color="default">自动补填</Tag>}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
