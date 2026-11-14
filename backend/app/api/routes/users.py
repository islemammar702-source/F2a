"""Users and roles administration."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission
from app.core.permissions import PERMISSIONS
from app.core.security import hash_password, validate_password_strength
from app.db.session import get_db
from app.models import ActivityLog, Client, Permission, Role, User, UserSession
from app.schemas.common import Page
from app.schemas.users import PermissionOut, RoleCreate, RoleOut, RoleUpdate, UserCreate, UserOut, UserUpdate
from app.services.audit import log_activity, notify_permission

router = APIRouter(tags=["users"])


def _check_password(pw: str) -> None:
    err = validate_password_strength(pw)
    if err:
        raise HTTPException(400, detail=err)


def _validate_role_client(db: Session, role: Role, client_id) -> None:
    if role.is_client_role:
        if client_id is None or db.get(Client, client_id) is None:
            raise HTTPException(400, detail="client_required_for_client_role")
    elif client_id is not None:
        raise HTTPException(400, detail="client_only_for_client_role")


def _email_taken(db: Session, email: str, exclude: uuid.UUID | None = None) -> bool:
    q = select(User.id).where(func.lower(User.email) == email.lower(), User.deleted_at.is_(None))
    if exclude:
        q = q.where(User.id != exclude)
    return db.execute(q).first() is not None


def _admin_count(db: Session) -> int:
    return db.execute(select(func.count()).select_from(User).join(Role).where(
        Role.code == "admin", User.is_active.is_(True), User.deleted_at.is_(None))).scalar_one()


@router.get("/users", response_model=Page[UserOut])
def list_users(
    q: str | None = None, role_id: uuid.UUID | None = None, is_active: bool | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_permission("users.view")),
):
    stmt = select(User).where(User.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if role_id:
        stmt = stmt.where(User.role_id == role_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("users.manage"))):
    _check_password(data.password)
    role = db.get(Role, data.role_id)
    if role is None:
        raise HTTPException(400, detail="role_not_found")
    _validate_role_client(db, role, data.client_id)
    if _email_taken(db, data.email):
        raise HTTPException(409, detail="email_taken")
    user = User(email=data.email.lower(), full_name=data.full_name, phone=data.phone,
                password_hash=hash_password(data.password), role_id=role.id, client_id=data.client_id,
                language=data.language, is_active=data.is_active)
    db.add(user)
    db.flush()
    log_activity(db, actor, "user.created", "user", user.id, summary=user.email, ip=client_ip(request))
    notify_permission(db, "users.manage", "user.created", {"name": user.full_name, "email": user.email},
                      "/users", exclude_user_id=actor.id)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_permission("users.view"))):
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, detail="not_found")
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, data: UserUpdate, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("users.manage"))):
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, detail="not_found")
    payload = data.model_dump(exclude_unset=True)
    revoke = False
    if "email" in payload and payload["email"]:
        if _email_taken(db, payload["email"], exclude=user.id):
            raise HTTPException(409, detail="email_taken")
        user.email = payload["email"].lower()
    role = user.role
    if payload.get("role_id"):
        role = db.get(Role, payload["role_id"])
        if role is None:
            raise HTTPException(400, detail="role_not_found")
    client_id = payload.get("client_id", user.client_id) if "client_id" in payload else user.client_id
    if role.is_client_role is False and "role_id" in payload and "client_id" not in payload:
        client_id = None
    _validate_role_client(db, role, client_id)
    was_admin_active = user.role.code == "admin" and user.is_active
    if role.id != user.role_id:
        revoke = True
    user.role_id = role.id
    user.role = role
    user.client_id = client_id
    for field in ("full_name", "phone", "language"):
        if field in payload and payload[field] is not None:
            setattr(user, field, payload[field])
    if payload.get("password"):
        _check_password(payload["password"])
        user.password_hash = hash_password(payload["password"])
        revoke = True
    if "is_active" in payload and payload["is_active"] is not None:
        if user.id == actor.id and payload["is_active"] is False:
            raise HTTPException(400, detail="cannot_disable_self")
        user.is_active = payload["is_active"]
        if not user.is_active:
            revoke = True
    db.flush()
    if was_admin_active and (user.role.code != "admin" or not user.is_active) and _admin_count(db) == 0:
        raise HTTPException(400, detail="last_admin")
    if revoke:
        db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
                   .values(revoked_at=datetime.now(timezone.utc)))
    log_activity(db, actor, "user.updated", "user", user.id, summary=user.email,
                 details={"fields": sorted(k for k in payload if k != "password")}, ip=client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: uuid.UUID, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("users.manage"))):
    """Accounts with history are soft-deleted (anonymised email kept unique), others hard-deleted."""
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, detail="not_found")
    if user.id == actor.id:
        raise HTTPException(400, detail="cannot_delete_self")
    if user.role.code == "admin" and _admin_count(db) <= 1 and user.is_active:
        raise HTTPException(400, detail="last_admin")
    has_history = db.execute(select(func.count()).select_from(ActivityLog).where(
        ActivityLog.user_id == user.id, ActivityLog.action.notlike("auth.%"))).scalar_one() > 0
    now = datetime.now(timezone.utc)
    db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
               .values(revoked_at=now))
    log_activity(db, actor, "user.deleted", "user", user.id, summary=user.email, ip=client_ip(request),
                 details={"soft": has_history})
    if has_history:
        user.deleted_at = now
        user.is_active = False
    else:
        db.execute(update(ActivityLog).where(ActivityLog.user_id == user.id).values(user_id=None))
        db.delete(user)
    db.commit()


# ---------------- Roles & permissions ----------------
def _role_out(db: Session, role: Role) -> RoleOut:
    count = db.execute(select(func.count()).select_from(User).where(User.role_id == role.id,
                                                                    User.deleted_at.is_(None))).scalar_one()
    return RoleOut.model_validate(role).model_copy(update={"user_count": count})


def _resolve_permissions(db: Session, codes: list[str]) -> list[Permission]:
    unknown = set(codes) - set(PERMISSIONS)
    if unknown:
        raise HTTPException(400, detail="unknown_permission")
    return list(db.execute(select(Permission).where(Permission.code.in_(codes))).scalars())


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require_permission("roles.manage"))):
    return db.execute(select(Permission).order_by(Permission.module, Permission.code)).scalars().all()


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), _: User = Depends(require_permission("users.view"))):
    return [_role_out(db, r) for r in db.execute(select(Role).order_by(Role.created_at)).scalars()]


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(data: RoleCreate, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("roles.manage"))):
    if db.execute(select(Role).where(Role.code == data.code)).first():
        raise HTTPException(409, detail="role_code_taken")
    role = Role(code=data.code, name_fr=data.name_fr, name_ar=data.name_ar, description=data.description,
                is_system=False, is_client_role=False)
    role.permissions = _resolve_permissions(db, data.permissions)
    db.add(role)
    db.flush()
    log_activity(db, actor, "role.created", "role", role.id, summary=role.code, ip=client_ip(request))
    db.commit()
    return _role_out(db, role)


@router.patch("/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: uuid.UUID, data: RoleUpdate, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("roles.manage"))):
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(404, detail="not_found")
    payload = data.model_dump(exclude_unset=True)
    for f in ("name_fr", "name_ar", "description"):
        if f in payload and payload[f] is not None:
            setattr(role, f, payload[f])
    if payload.get("permissions") is not None:
        if role.code == "admin":
            raise HTTPException(400, detail="admin_role_locked")
        if role.is_client_role and payload["permissions"]:
            raise HTTPException(400, detail="client_role_no_permissions")
        role.permissions = _resolve_permissions(db, payload["permissions"])
    log_activity(db, actor, "role.updated", "role", role.id, summary=role.code, ip=client_ip(request),
                 details={"permissions": payload.get("permissions")})
    db.commit()
    return _role_out(db, role)


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(role_id: uuid.UUID, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(require_permission("roles.manage"))):
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(404, detail="not_found")
    if role.is_system:
        raise HTTPException(400, detail="system_role")
    if db.execute(select(func.count()).select_from(User).where(User.role_id == role.id)).scalar_one():
        raise HTTPException(400, detail="role_in_use")
    log_activity(db, actor, "role.deleted", "role", role.id, summary=role.code, ip=client_ip(request))
    db.delete(role)
    db.commit()
