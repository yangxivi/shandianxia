"""JWT 鉴权与密码哈希（直接使用 bcrypt，规避 passlib 兼容性问题）"""
import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

SECRET = os.getenv("JWT_SECRET", "lightning-electricity-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24          # 后台登录令牌 1 天
METER_TOKEN_EXPIRE_DAYS = 3650                 # 电表二维码令牌 10 年（长期有效）


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET, algorithm=ALGORITHM)


def create_meter_token(device_id: int, reader_id: int, username: str) -> str:
    """生成电表专属二维码令牌：绑定设备 + 责任人，长期有效"""
    expire = datetime.utcnow() + timedelta(days=METER_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": username,
        "device_id": device_id,
        "reader_id": reader_id,
        "typ": "meter",
        "exp": expire,
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=[ALGORITHM])
