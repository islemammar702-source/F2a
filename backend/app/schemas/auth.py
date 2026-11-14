import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORM


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class RoleBrief(ORM):
    id: uuid.UUID
    code: str
    name_fr: str
    name_ar: str
    is_client_role: bool


class Me(ORM):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    language: str
    role: RoleBrief
    client_id: uuid.UUID | None
    permissions: list[str]
    last_login_at: datetime | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Me


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=160)
    phone: str | None = Field(None, max_length=32)
    language: str | None = Field(None, pattern="^(fr|ar)$")


class SessionOut(ORM):
    id: uuid.UUID
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    expires_at: datetime
    current: bool = False
