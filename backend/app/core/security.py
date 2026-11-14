"""Password hashing (Argon2id), JWT access tokens and opaque refresh tokens."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher()  # Argon2id with library-recommended parameters


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# Dummy hash used to equalise timing when the email does not exist
DUMMY_HASH = hash_password("timing-equaliser-password")


def create_access_token(user_id: uuid.UUID, role: str, session_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "sid": str(session_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def validate_password_strength(password: str) -> str | None:
    """Return an error code or None."""
    if len(password) < 8:
        return "password_too_short"
    if not any(c.isdigit() for c in password) or not any(c.isalpha() for c in password):
        return "password_too_weak"
    return None
