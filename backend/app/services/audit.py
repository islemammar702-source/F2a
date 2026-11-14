"""Activity log and internal notifications."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActivityLog, Notification, Permission, Role, User, role_permissions


def log_activity(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    summary: str | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        ActivityLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary[:255] if summary else None,
            details=details or {},
            ip_address=ip,
        )
    )


def notify_permission(db: Session, permission_code: str, ntype: str, data: dict, link: str | None = None,
                      exclude_user_id: uuid.UUID | None = None) -> None:
    """Notify every active staff user holding the given permission."""
    users = db.execute(
        select(User.id)
        .join(Role, Role.id == User.role_id)
        .join(role_permissions, role_permissions.c.role_id == Role.id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(Permission.code == permission_code, User.is_active.is_(True), User.deleted_at.is_(None))
    ).scalars().unique().all()
    for uid in users:
        if uid != exclude_user_id:
            db.add(Notification(user_id=uid, type=ntype, data=data, link=link))


def notify_client_users(db: Session, client_id: uuid.UUID, ntype: str, data: dict, link: str | None = None) -> None:
    users = db.execute(
        select(User.id).where(User.client_id == client_id, User.is_active.is_(True), User.deleted_at.is_(None))
    ).scalars().all()
    for uid in users:
        db.add(Notification(user_id=uid, type=ntype, data=data, link=link))
