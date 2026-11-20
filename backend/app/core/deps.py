"""FastAPI dependencies: authentication and permission checks (enforced server-side)."""
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db  # noqa: F401  (re-exported for routes)
from app.models import User, UserSession

bearer = HTTPBearer(auto_error=False)


def _unauthorized(code: str = "not_authenticated") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=code, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise _unauthorized()
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized("invalid_token")

    sess = db.get(UserSession, session_id)
    now = datetime.now(timezone.utc)
    if sess is None or sess.revoked_at is not None or sess.expires_at < now or sess.user_id != user_id:
        raise _unauthorized("session_expired")

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None or not user.is_active or user.deleted_at is not None:
        raise _unauthorized("account_disabled")
    request.state.user = user
    request.state.session_id = session_id
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role.is_client_role:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
    return user


def require_permission(*codes: str):
    """Require ALL the given permission codes."""

    def checker(user: User = Depends(require_staff)) -> User:
        missing = [c for c in codes if c not in user.permission_codes]
        if missing:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return checker


def require_any_permission(*codes: str):
    def checker(user: User = Depends(require_staff)) -> User:
        if not user.permission_codes.intersection(codes):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return checker


def require_client(user: User = Depends(get_current_user)) -> User:
    if not user.role.is_client_role or user.client_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
    return user


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return request.client.host if request.client else None
