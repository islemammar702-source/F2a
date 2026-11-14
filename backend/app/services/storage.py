"""Private file storage. Files are saved with random names outside any public directory;
they are only served through authorised API endpoints."""
import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Document

ALLOWED_UPLOAD_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAGIC = {
    "application/pdf": [b"%PDF"],
    "image/png": [b"\x89PNG"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],
}


def _root() -> Path:
    root = Path(settings.STORAGE_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_bytes(db: Session, data: bytes, *, kind: str, filename: str, mime: str, entity_type: str | None = None,
               entity_id=None, client_id=None, user_id=None) -> Document:
    sub = _root() / kind
    sub.mkdir(parents=True, exist_ok=True)
    ext = ALLOWED_UPLOAD_TYPES.get(mime, Path(filename).suffix[:8] or ".bin")
    path = sub / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(data)
    doc = Document(kind=kind, entity_type=entity_type, entity_id=entity_id, client_id=client_id,
                   filename=filename[:255], storage_path=str(path.relative_to(_root())), mime_type=mime,
                   size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), uploaded_by_id=user_id)
    db.add(doc)
    db.flush()
    return doc


async def save_upload(db: Session, upload: UploadFile, **kw) -> Document:
    mime = (upload.content_type or "").lower()
    if mime not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(400, detail="file_type_not_allowed")
    data = await upload.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(400, detail="file_too_large")
    if not any(data.startswith(m) for m in MAGIC[mime]):
        raise HTTPException(400, detail="file_content_mismatch")
    safe_name = Path(upload.filename or "file").name
    return save_bytes(db, data, mime=mime, filename=safe_name, **kw)


def absolute_path(doc: Document) -> Path:
    p = (_root() / doc.storage_path).resolve()
    if _root().resolve() not in p.parents:
        raise HTTPException(400, detail="invalid_path")
    return p


def store_generated_pdf(db: Session, data: bytes, *, kind: str, filename: str, entity_type: str, entity_id,
                        client_id, user_id=None) -> Document:
    """Keep only the latest generated PDF per entity+language (filename)."""
    old = db.execute(
        select(Document).where(Document.entity_type == entity_type, Document.entity_id == entity_id,
                               Document.kind == kind, Document.filename == filename)
    ).scalars().all()
    for d in old:
        try:
            absolute_path(d).unlink(missing_ok=True)
        except HTTPException:
            pass
        db.delete(d)
    return save_bytes(db, data, kind=kind, filename=filename, mime="application/pdf", entity_type=entity_type,
                      entity_id=entity_id, client_id=client_id, user_id=user_id)


def logo_path(db: Session, cs) -> str | None:
    if cs.logo_document_id:
        doc = db.get(Document, cs.logo_document_id)
        if doc:
            p = absolute_path(doc)
            if p.exists():
                return str(p)
    return None
