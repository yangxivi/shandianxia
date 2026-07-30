"""初始化种子数据：管理员 + 10台设备 + 10个抄表责任人 + 默认电价
首次启动自动执行；也可 `python -m app.seed` 单独执行。
"""
from .db import SessionLocal, init_db
from . import models
from .security import hash_password


def seed_if_empty():
    db = SessionLocal()
    try:
        if db.query(models.User).first():
            return
        # 管理员
        admin = models.User(
            username="admin", full_name="系统管理员",
            hashed_password=hash_password("admin123"), role="admin",
        )
        db.add(admin)

        # 10 台设备 + 10 个抄表责任人（一人一码一设备）
        for i in range(1, 11):
            no = f"{i:02d}"
            reader = models.User(
                username=f"reader{no}", full_name=f"抄表员{no}",
                hashed_password=hash_password("reader123"), role="reader",
            )
            db.add(reader)
            db.flush()
            dev = models.Device(
                device_no=f"DEV-{no}",
                device_name=f"生产设备{no}号",
                meter_no=f"METER-{no}",
                multiplier=1.0,
                reader_id=reader.id,
            )
            db.add(dev)

        # 默认电单价 0.85 元/度
        db.add(models.Config(key="unit_price", value="0.85", note="当期电单价(元/度)"))
        db.commit()
        print("[seed] 已初始化：1 管理员 + 10 设备 + 10 抄表员 + 默认电价 0.85")
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    seed_if_empty()
