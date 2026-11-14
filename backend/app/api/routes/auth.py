"""Authentication: login, refresh-token rotation, logout, password reset, profile."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import client_ip, get_current_user
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    password_needs_rehash,
    validate_password_strength,
    verify_password,
)
from app.db.session import get_db
from app.models import PasswordResetToken, User, UserSession
from app.schemas.auth import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    Me,
    ProfileUpdate,
    ResetPasswordIn,
    SessionOut,
    TokenOut,
)
from app.services.audit import log_activity
from app.services.mailer import send_email
from app.services.ratelimit import RateLimiter

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("f2a.auth")
login_limiter = RateLimiter(settings.LOGIN_MAX_ATTEMPTS, settings.LOGIN_WINDOW_SECONDS)
reset_limiter = RateLimiter(5, 3600)

COOKIE_PATH = "/api/auth"


def to_me(user: User) -> Me:
    return Me(
        id=user.id, email=user.email, full_name=user.full_name, phone=user.phone, language=user.language,
        role=user.role, client_id=user.client_id, permissions=sorted(user.permission_codes),
        last_login_at=user.last_login_at,
    )


def _set_refresh_cookie(response: Response, token: str, remember: bool, expires_at: datetime) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, token, httponly=True, secure=settings.COOKIE_SECURE, samesite="strict",
        path=COOKIE_PATH, max_age=int((expires_at - datetime.now(timezone.utc)).total_seconds()) if remember else None,
    )


def _new_session(db: Session, user: User, remember: bool, request: Request, family_id: uuid.UUID | None = None):
    now = datetime.now(timezone.utc)
    token = new_opaque_token()
    expires = now + (timedelta(days=settings.REFRESH_TOKEN_DAYS_REMEMBER) if remember
                     else timedelta(hours=settings.REFRESH_TOKEN_HOURS_SESSION))
    sess = UserSession(
        user_id=user.id, token_hash=hash_token(token), family_id=family_id or uuid.uuid4(), remember=remember,
        user_agent=(request.headers.get("user-agent") or "")[:255], ip_address=client_ip(request),
        created_at=now, expires_at=expires,
    )
    db.add(sess)
    db.flush()
    return sess, token


def _token_response(user: User, sess: UserSession) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, user.role.code, sess.id),
        expires_in=settings.ACCESS_TOKEN_MINUTES * 60, user=to_me(user),
    )


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = data.email.lower().strip()
    key = f"{client_ip(request)}|{email}"
    if login_limiter.is_blocked(key):
        raise HTTPException(429, detail="too_many_attempts")

    user = db.execute(select(User).where(User.email == email, User.deleted_at.is_(None))).scalar_one_or_none()
    if user is None:
        verify_password(data.password, DUMMY_HASH)  # constant-ish timing
        login_limiter.hit(key)
        raise HTTPException(401, detail="invalid_credentials")
    if not verify_password(data.password, user.password_hash):
        login_limiter.hit(key)
        log_activity(db, user, "auth.login_failed", "user", user.id, ip=client_ip(request))
        db.commit()
        raise HTTPException(401, detail="invalid_credentials")
    if not user.is_active:
        raise HTTPException(403, detail="account_disabled")

    login_limiter.reset(key)
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
    user.last_login_at = datetime.now(timezone.utc)
    sess, token = _new_session(db, user, data.remember, request)
    log_activity(db, user, "auth.login", "user", user.id, summary=user.email, ip=client_ip(request))
    db.commit()
    _set_refresh_cookie(response, token, data.remember, sess.expires_at)
    return _token_response(user, sess)


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(401, detail="no_refresh_token")
    sess = db.execute(
        select(UserSession).where(UserSession.token_hash == hash_token(token)).with_for_update()
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if sess is None:
        raise HTTPException(401, detail="invalid_refresh_token")
    if sess.revoked_at is not None:
        # Token reuse detected: revoke the whole session family
        db.execute(update(UserSession).where(UserSession.family_id == sess.family_id, UserSession.revoked_at.is_(None))
                   .values(revoked_at=now))
        db.commit()
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=COOKIE_PATH)
        raise HTTPException(401, detail="refresh_token_reused")
    if sess.expires_at < now:
        raise HTTPException(401, detail="session_expired")
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(401, detail="account_disabled")

    new_sess, new_token = _new_session(db, user, sess.remember, request, family_id=sess.family_id)
    sess.revoked_at = now
    sess.replaced_by = new_sess.id
    db.commit()
    _set_refresh_cookie(response, new_token, sess.remember, new_sess.expires_at)
    return _token_response(user, new_sess)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if token:
        sess = db.execute(select(UserSession).where(UserSession.token_hash == hash_token(token))).scalar_one_or_none()
        if sess and sess.revoked_at is None:
            sess.revoked_at = datetime.now(timezone.utc)
            user = db.get(User, sess.user_id)
            log_activity(db, user, "auth.logout", "user", sess.user_id, ip=client_ip(request))
            db.commit()
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=COOKIE_PATH)
    response.status_code = 204
    return response


@router.get("/me", response_model=Me)
def me(user: User = Depends(get_current_user)):
    return to_me(user)


@router.patch("/me", response_model=Me)
def update_me(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(user, k, v)
    db.commit()
    return to_me(user)


@router.post("/change-password", status_code=204)
def change_password(data: ChangePasswordIn, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, detail="wrong_current_password")
    err = validate_password_strength(data.new_password)
    if err:
        raise HTTPException(400, detail=err)
    user.password_hash = hash_password(data.new_password)
    # revoke all other sessions
    db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.id != request.state.session_id,
                                         UserSession.revoked_at.is_(None)).values(revoked_at=datetime.now(timezone.utc)))
    log_activity(db, user, "auth.password_changed", "user", user.id, ip=client_ip(request))
    db.commit()


@router.get("/sessions", response_model=list[SessionOut])
def my_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rows = db.execute(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None),
                                                UserSession.expires_at > now).order_by(UserSession.created_at.desc())).scalars()
    return [SessionOut.model_validate(s).model_copy(update={"current": s.id == request.state.session_id}) for s in rows]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sess = db.get(UserSession, session_id)
    if sess is None or sess.user_id != user.id:
        raise HTTPException(404, detail="not_found")
    sess.revoked_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Always returns the same response (no account enumeration)."""
    key = client_ip(request) or "?"
    if reset_limiter.is_blocked(key):
        raise HTTPException(429, detail="too_many_attempts")
    reset_limiter.hit(key)
    out: dict = {"detail": "reset_email_sent"}
    user = db.execute(select(User).where(User.email == data.email.lower(), User.deleted_at.is_(None),
                                         User.is_active.is_(True))).scalar_one_or_none()
    if user:
        token = new_opaque_token()
        now = datetime.now(timezone.utc)
        db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(token), created_at=now,
                                  expires_at=now + timedelta(hours=1)))
        log_activity(db, user, "auth.password_reset_requested", "user", user.id, ip=client_ip(request))
        db.commit()
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        sent = send_email(user.email, "F2A MANAGER – Réinitialisation du mot de passe",
                          f"Bonjour {user.full_name},\n\nPour réinitialiser votre mot de passe, ouvrez ce lien (valable 1 h) :\n{link}\n")
        if not sent:
            log.warning("Password reset link for %s: %s", user.email, link)
            if settings.is_dev:
                out["dev_reset_link"] = link  # development only – never in production
    return out


@router.post("/reset-password", status_code=204)
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    err = validate_password_strength(data.new_password)
    if err:
        raise HTTPException(400, detail=err)
    now = datetime.now(timezone.utc)
    prt = db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(data.token))
                     .with_for_update()).scalar_one_or_none()
    if prt is None or prt.used_at is not None or prt.expires_at < now:
        raise HTTPException(400, detail="invalid_or_expired_token")
    user = db.get(User, prt.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(400, detail="invalid_or_expired_token")
    user.password_hash = hash_password(data.new_password)
    prt.used_at = now
    db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
               .values(revoked_at=now))
    log_activity(db, user, "auth.password_reset", "user", user.id)
    db.commit()
