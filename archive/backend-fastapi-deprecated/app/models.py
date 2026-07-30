"""数据模型：用户、设备(电表)、每日抄表、系统配置"""
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)          # 姓名
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="reader")              # admin / reader
    devices = relationship("Device", back_populates="reader")


class Device(Base):
    """一台生产设备 = 一个独立电表 = 一个专属二维码 = 一个抄表责任人"""
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    device_no = Column(String(20), unique=True, index=True, nullable=False)   # 设备编号
    device_name = Column(String(100), nullable=False)                        # 设备名称
    meter_no = Column(String(50), unique=True, index=True, nullable=False)    # 电表编号
    multiplier = Column(Float, default=1.0)                                  # 电表倍率
    reader_id = Column(Integer, ForeignKey("users.id"), nullable=True)       # 抄表责任人
    reader = relationship("User", back_populates="devices")
    readings = relationship("Reading", back_populates="device", cascade="all, delete-orphan")


class Reading(Base):
    """每日抄表一条记录，后台自动核算电量/电费"""
    __tablename__ = "readings"
    __table_args__ = (UniqueConstraint("device_id", "read_date", name="uq_device_date"),)
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    read_date = Column(Date, nullable=False, index=True)        # 填报日期（系统自动，不可改）
    reading_value = Column(Float, nullable=False)              # 当日电表读数（人工填写）
    yesterday_value = Column(Float, default=0.0)               # 昨日读数（系统留存）
    multiplier = Column(Float, default=1.0)                    # 当时倍率
    daily_kwh = Column(Float, default=0.0)                     # 每日电量
    unit_price = Column(Float, default=0.0)                    # 当时电单价
    daily_fee = Column(Float, default=0.0)                     # 每日电费
    reader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reader_name = Column(String(100), nullable=True)           # 填报人（快照）
    created_at = Column(DateTime, default=datetime.utcnow)
    device = relationship("Device", back_populates="readings")


class Config(Base):
    """系统级配置，如当期电单价"""
    __tablename__ = "config"
    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)
    value = Column(String(200), nullable=False)
    note = Column(String(200), nullable=True)
