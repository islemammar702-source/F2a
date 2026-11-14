import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import RoleBrief
from app.schemas.common import ORM


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(None, max_length=32)
    password: str = Field(min_length=8, max_length=200)
    role_id: uuid.UUID
    client_id: uuid.UUID | None = None
    language: str = Field("fr", pattern="^(fr|ar)$")
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(None, min_length=2, max_length=160)
    phone: str | None = Field(None, max_length=32)
    password: str | None = Field(None, min_length=8, max_length=200)
    role_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    language: str | None = Field(None, pattern="^(fr|ar)$")
    is_active: bool | None = None


class UserOut(ORM):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    language: str
    is_active: bool
    role: RoleBrief
    client_id: uuid.UUID | None
    last_login_at: datetime | None
    created_at: datetime


class PermissionOut(ORM):
    id: uuid.UUID
    code: str
    module: str
    description: str | None


class RoleOut(ORM):
    id: uuid.UUID
    code: str
    name_fr: str
    name_ar: str
    description: str | None
    is_system: bool
    is_client_role: bool
    permissions: list[PermissionOut]
    user_count: int = 0


class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32, pattern="^[a-z][a-z0-9_]*$")
    name_fr: str = Field(min_length=2, max_length=64)
    name_ar: str = Field(min_length=2, max_length=64)
    description: str | None = None
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    name_fr: str | None = Field(None, min_length=2, max_length=64)
    name_ar: str | None = Field(None, min_length=2, max_length=64)
    description: str | None = None
    permissions: list[str] | None = None
