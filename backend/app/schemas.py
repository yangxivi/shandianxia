"""Pydantic 数据契约"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "reader"  # admin / reader


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str


class DeviceCreate(BaseModel):
    device_no: str
    device_name: str
    meter_no: str
    multiplier: float = 1.0
    reader_id: Optional[int] = None


class DeviceOut(BaseModel):
    id: int
    device_no: str
    device_name: str
    meter_no: str
    multiplier: float
    reader_id: Optional[int] = None
    reader_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ReadingSubmit(BaseModel):
    token: str                                   # 电表专属二维码令牌
    reading_value: float = Field(gt=0, description="当日电表读数，必须为正数")


class ReadingOut(BaseModel):
    id: int
    device_id: int
    device_no: str
    meter_no: str
    read_date: date
    reading_value: float
    yesterday_value: float
    multiplier: float
    daily_kwh: float
    unit_price: float
    daily_fee: float
    reader_id: Optional[int] = None
    reader_name: Optional[str] = None

    model_config = {"from_attributes": True}


class MeterInfo(BaseModel):
    device_no: str
    device_name: str
    meter_no: str
    reader_name: str
    read_date: str
