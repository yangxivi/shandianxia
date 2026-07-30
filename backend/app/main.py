"""闪电侠-电费管理系统 后端主程序

核心规则：
- 一设备一电表一码一责任人，数据独立核算
- 填报日期由系统自动取当日，人工不可改
- 每日电量 = (当日读数 - 昨日读数) × 倍率
- 每日电费 = 每日电量 × 当期电单价
- 当日读数 < 昨日读数 → 拦截提交（异常）
- 同一电表当日仅允许一次填报
"""
import io
import os
from datetime import date, datetime, timedelta

import qrcode
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import func
from sqlalchemy.orm import Session

from .db import SessionLocal, init_db
from . import models, schemas, security
from .security import (
    create_access_token, create_meter_token, decode_token,
    hash_password, verify_password,
)

app = FastAPI(title="闪电侠-电费管理系统", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ----------------------------- 依赖 -----------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    cred_exc = HTTPException(status_code=401, detail="无效或过期的登录凭证")
    try:
        payload = decode_token(token)
        username = payload.get("sub")
    except JWTError:
        raise cred_exc
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise cred_exc
    return user


def require_admin(user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


def get_unit_price(db: Session) -> float:
    cfg = db.query(models.Config).filter(models.Config.key == "unit_price").first()
    return float(cfg.value) if cfg and cfg.value else 0.0


def previous_reading(db: Session, device_id: int, today: date):
    return (
        db.query(models.Reading)
        .filter(models.Reading.device_id == device_id, models.Reading.read_date < today)
        .order_by(models.Reading.read_date.desc())
        .first()
    )


# ----------------------------- 鉴权 -----------------------------
@app.post("/api/auth/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token({"sub": user.username, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name,
    }


@app.get("/api/me")
def me(user=Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role}


# ----------------------------- 公开扫码抄表 -----------------------------
@app.get("/api/meter/info", response_model=schemas.MeterInfo)
def meter_info(token: str, db: Session = Depends(get_db)):
    """扫码后解析二维码令牌，返回自动填充字段（设备/电表/责任人/日期）"""
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=400, detail="二维码无效或已过期")
    if payload.get("typ") != "meter":
        raise HTTPException(status_code=400, detail="无效的二维码")
    device = db.query(models.Device).filter(models.Device.id == payload["device_id"]).first()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    reader = db.query(models.User).filter(models.User.id == payload["reader_id"]).first()
    return {
        "device_no": device.device_no,
        "device_name": device.device_name,
        "meter_no": device.meter_no,
        "reader_name": reader.full_name if reader else "未绑定责任人",
        "read_date": date.today().isoformat(),
    }


@app.post("/api/meter/submit")
def submit_reading(payload: schemas.ReadingSubmit, db: Session = Depends(get_db)):
    """提交当日抄表：系统自动核算，含重复/异常拦截"""
    try:
        tok = decode_token(payload.token)
    except JWTError:
        raise HTTPException(status_code=400, detail="二维码无效或已过期")
    if tok.get("typ") != "meter":
        raise HTTPException(status_code=400, detail="无效的二维码")

    device = db.query(models.Device).filter(models.Device.id == tok["device_id"]).first()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    reader = db.query(models.User).filter(models.User.id == tok["reader_id"]).first()
    today = date.today()

    # 1) 当日重复填报拦截
    if db.query(models.Reading).filter(
        models.Reading.device_id == device.id, models.Reading.read_date == today
    ).first():
        raise HTTPException(status_code=409, detail="当日已完成抄表，无需重复填报")

    # 2) 正数校验（Schema 已限制 gt=0，此处兜底）
    if payload.reading_value <= 0:
        raise HTTPException(status_code=400, detail="读数必须为正数")

    # 3) 取值昨日读数并做异常拦截
    prev = previous_reading(db, device.id, today)
    if prev:
        yesterday = prev.reading_value
        if payload.reading_value < yesterday:
            raise HTTPException(status_code=400, detail="当日读数低于昨日读数，请核对电表数据")
        daily_kwh = round((payload.reading_value - yesterday) * device.multiplier, 3)
        yesterday_value = yesterday
    else:
        # 首次抄表：作为基准读数，当日电量记为 0
        yesterday_value = payload.reading_value
        daily_kwh = 0.0

    unit_price = get_unit_price(db)
    daily_fee = round(daily_kwh * unit_price, 2)

    rec = models.Reading(
        device_id=device.id,
        read_date=today,
        reading_value=payload.reading_value,
        yesterday_value=yesterday_value,
        multiplier=device.multiplier,
        daily_kwh=daily_kwh,
        unit_price=unit_price,
        daily_fee=daily_fee,
        reader_id=reader.id if reader else None,
        reader_name=reader.full_name if reader else None,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {
        "ok": True,
        "device_no": device.device_no,
        "read_date": today.isoformat(),
        "daily_kwh": daily_kwh,
        "daily_fee": daily_fee,
    }


# ----------------------------- 管理员：设备/人员/单价 -----------------------------
@app.get("/api/admin/devices", response_model=list[schemas.DeviceOut])
def list_devices(db: Session = Depends(get_db), _=Depends(require_admin)):
    devs = db.query(models.Device).all()
    for d in devs:
        d.reader_name = d.reader.full_name if d.reader else None
    return devs


@app.post("/api/admin/devices", response_model=schemas.DeviceOut)
def create_device(d: schemas.DeviceCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(models.Device).filter(models.Device.device_no == d.device_no).first():
        raise HTTPException(status_code=400, detail="设备编号已存在")
    if db.query(models.Device).filter(models.Device.meter_no == d.meter_no).first():
        raise HTTPException(status_code=400, detail="电表编号已存在")
    obj = models.Device(**d.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    obj.reader_name = obj.reader.full_name if obj.reader else None
    return obj


@app.put("/api/admin/devices/{did}", response_model=schemas.DeviceOut)
def update_device(did: int, d: schemas.DeviceCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    obj = db.query(models.Device).filter(models.Device.id == did).first()
    if not obj:
        raise HTTPException(status_code=404, detail="设备不存在")
    for k, v in d.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    obj.reader_name = obj.reader.full_name if obj.reader else None
    return obj


@app.get("/api/admin/users")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return [
        {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role}
        for u in db.query(models.User).all()
    ]


@app.get("/api/admin/price")
def get_price(db: Session = Depends(get_db), _=Depends(require_admin)):
    return {"unit_price": get_unit_price(db)}


@app.put("/api/admin/price")
def set_price(body: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    try:
        val = float(body.get("unit_price"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="电单价必须为数字")
    if val < 0:
        raise HTTPException(status_code=400, detail="电单价不能为负")
    cfg = db.query(models.Config).filter(models.Config.key == "unit_price").first()
    if not cfg:
        cfg = models.Config(key="unit_price", value=str(val), note="当期电单价(元/度)")
        db.add(cfg)
    else:
        cfg.value = str(val)
    db.commit()
    return {"unit_price": val}


# ----------------------------- 管理员：台账查询/筛选 -----------------------------
def _build_reading_query(db, device_id, meter_no, start, end, month, reader_id):
    q = db.query(models.Reading)
    if device_id:
        q = q.filter(models.Reading.device_id == device_id)
    if reader_id:
        q = q.filter(models.Reading.reader_id == reader_id)
    if start:
        q = q.filter(models.Reading.read_date >= date.fromisoformat(start))
    if end:
        q = q.filter(models.Reading.read_date <= date.fromisoformat(end))
    if month:
        q = q.filter(func.strftime("%Y-%m", models.Reading.read_date) == month)
    if meter_no:
        q = q.join(models.Device).filter(models.Device.meter_no == meter_no)
    return q


@app.get("/api/admin/readings", response_model=list[schemas.ReadingOut])
def list_readings(
    device_id: int = None, meter_no: str = None, start: str = None, end: str = None,
    month: str = None, reader_id: int = None,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    q = _build_reading_query(db, device_id, meter_no, start, end, month, reader_id)
    rows = q.order_by(models.Reading.read_date.desc()).all()
    for r in rows:
        r.device_no = r.device.device_no
        r.meter_no = r.device.meter_no
    return rows


# ----------------------------- 管理员：月度汇总 -----------------------------
@app.get("/api/admin/summary/monthly")
def monthly_summary(month: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    if not month or len(month) != 7:
        raise HTTPException(status_code=400, detail="月份格式应为 YYYY-MM")
    devices = db.query(models.Device).order_by(models.Device.device_no).all()
    result, total_kwh, total_fee = [], 0.0, 0.0
    for dev in devices:
        agg = (
            db.query(func.sum(models.Reading.daily_kwh), func.sum(models.Reading.daily_fee))
            .filter(models.Reading.device_id == dev.id,
                    func.strftime("%Y-%m", models.Reading.read_date) == month)
            .first()
        )
        kwh = float(agg[0] or 0.0)
        fee = float(agg[1] or 0.0)
        total_kwh += kwh
        total_fee += fee
        result.append({
            "device_no": dev.device_no,
            "device_name": dev.device_name,
            "meter_no": dev.meter_no,
            "total_kwh": round(kwh, 3),
            "total_fee": round(fee, 2),
        })
    return {
        "month": month,
        "devices": result,
        "total_kwh": round(total_kwh, 3),
        "total_fee": round(total_fee, 2),
    }


# ----------------------------- 管理员：Excel 导出 -----------------------------
def _export_stream(wb, filename):
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/admin/export/daily")
def export_daily(
    device_id: int = None, meter_no: str = None, start: str = None, end: str = None,
    month: str = None, reader_id: int = None,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    import openpyxl
    q = _build_reading_query(db, device_id, meter_no, start, end, month, reader_id)
    rows = q.order_by(models.Reading.read_date.desc()).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "每日明细"
    headers = ["填报日期", "设备编号", "设备名称", "电表编号", "昨日读数",
               "当日读数", "电表倍率", "每日电量(度)", "电单价(元/度)", "每日电费(元)", "抄表人"]
    ws.append(headers)
    for r in rows:
        ws.append([
            r.read_date.isoformat(), r.device.device_no, r.device.device_name, r.device.meter_no,
            r.yesterday_value, r.reading_value, r.multiplier, r.daily_kwh, r.unit_price,
            r.daily_fee, r.reader_name,
        ])
    return _export_stream(wb, f"daily_readings_{date.today().isoformat()}.xlsx")


@app.get("/api/admin/export/monthly")
def export_monthly(month: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    import openpyxl
    data = monthly_summary(month, db)["devices"]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{month}月度汇总"
    ws.append(["月份", month])
    ws.append(["设备编号", "设备名称", "电表编号", "月度总电量(度)", "月度总电费(元)"])
    for d in data:
        ws.append([d["device_no"], d["device_name"], d["meter_no"], d["total_kwh"], d["total_fee"]])
    return _export_stream(wb, f"monthly_summary_{month}.xlsx")


# ----------------------------- 管理员：二维码 -----------------------------
@app.get("/api/admin/qr/{device_id}")
def qr_image(device_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    token = create_meter_token(
        device.id, device.reader_id or 0,
        device.reader.username if device.reader else "",
    )
    base = os.getenv("PUBLIC_BASE_URL", "http://localhost:5173")
    url = f"{base}/#/meter?token={token}"
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.on_event("startup")
def on_startup():
    init_db()
    from .seed import seed_if_empty
    seed_if_empty()
