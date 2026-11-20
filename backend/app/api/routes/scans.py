"""Scan / photo import for quotes, invoices and payments.

1. POST /scan/{target}            upload a photo/PDF → file stored + (optional) AI reading → data to pre-fill the form
2. POST /attachments/{type}/{id}  link uploaded scans to the saved quote/invoice (or upload a new one directly)
3. GET  /attachments/{type}/{id}  list attachments; DELETE /attachments/file/{doc_id} removes one
Payments reuse the existing proof mechanism: the scan is stored as a payment_proof document.
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_db, require_staff
from app.models import Document, Invoice, Quote, User
from app.schemas.system import DocumentOut
from app.services.audit import log_activity
from app.services.scan_ai import ScanError, ai_enabled, engine, extract
from app.services.storage import absolute_path, save_upload

router = APIRouter(tags=["scan"])

# target → (stored document kind, permission needed to scan, permission to view)
TARGETS = {
    "quote": ("quote_scan", "quotes.manage", "quotes.view"),
    "invoice": ("invoice_scan", "invoices.manage", "invoices.view"),
    "payment": ("payment_proof", "payments.manage", "payments.view"),
}
ENTITY_MODELS = {"quote": Quote, "invoice": Invoice}


def _check(user: User, perm: str):
    if perm not in user.permission_codes:
        raise HTTPException(403, detail="forbidden")


def _target(target: str):
    if target not in TARGETS:
        raise HTTPException(404, detail="not_found")
    return TARGETS[target]


class ScanOut(BaseModel):
    document: DocumentOut
    ai_enabled: bool
    engine: str | None = None  # "claude" (AI) | "ocr" (free, offline)
    extracted: dict | None = None
    ai_error: str | None = None


@router.post("/scan/{target}", response_model=ScanOut, status_code=201)
async def scan(target: str, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
               user: User = Depends(require_staff)):
    kind, manage, _ = _target(target)
    _check(user, manage)
    doc = await save_upload(db, file, kind=kind, user_id=user.id)
    log_activity(db, user, "scan.uploaded", "document", doc.id, summary=f"{target}: {doc.filename}", ip=client_ip(request))
    db.commit()
    db.refresh(doc)

    extracted, err = None, None
    if ai_enabled():
        try:
            # blocking HTTP call to the AI (up to ~30 s): run it off the event loop
            extracted = await run_in_threadpool(extract, absolute_path(doc).read_bytes(), doc.mime_type, target)
        except ScanError as e:
            err = str(e)
    return ScanOut(document=DocumentOut.model_validate(doc), ai_enabled=ai_enabled(), engine=engine(), extracted=extracted, ai_error=err)


def _entity(db: Session, entity_type: str, entity_id: uuid.UUID):
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(404, detail="not_found")
    obj = db.get(model, entity_id)
    if obj is None:
        raise HTTPException(404, detail="not_found")
    return obj


class LinkIn(BaseModel):
    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)


@router.post("/attachments/{entity_type}/{entity_id}", response_model=list[DocumentOut])
def link_attachments(entity_type: str, entity_id: uuid.UUID, data: LinkIn, request: Request, db: Session = Depends(get_db),
                     user: User = Depends(require_staff)):
    kind, manage, _ = _target(entity_type)
    _check(user, manage)
    obj = _entity(db, entity_type, entity_id)
    docs = db.execute(select(Document).where(Document.id.in_(data.document_ids))).scalars().all()
    for d in docs:
        # only free scans of the right kind, uploaded by this user, can be attached
        if d.kind != kind or d.entity_id is not None or d.uploaded_by_id != user.id:
            raise HTTPException(400, detail="invalid_attachment")
        d.entity_type, d.entity_id, d.client_id = entity_type, obj.id, obj.client_id
    log_activity(db, user, "attachment.added", entity_type, obj.id, summary=obj.number, ip=client_ip(request))
    db.commit()
    return _list(db, entity_type, obj.id, kind)


@router.post("/attachments/{entity_type}/{entity_id}/upload", response_model=list[DocumentOut], status_code=201)
async def upload_attachment(entity_type: str, entity_id: uuid.UUID, request: Request, file: UploadFile = File(...),
                            db: Session = Depends(get_db), user: User = Depends(require_staff)):
    kind, manage, _ = _target(entity_type)
    _check(user, manage)
    obj = _entity(db, entity_type, entity_id)
    await save_upload(db, file, kind=kind, entity_type=entity_type, entity_id=obj.id, client_id=obj.client_id, user_id=user.id)
    log_activity(db, user, "attachment.added", entity_type, obj.id, summary=obj.number, ip=client_ip(request))
    db.commit()
    return _list(db, entity_type, obj.id, kind)


def _list(db: Session, entity_type: str, entity_id: uuid.UUID, kind: str):
    rows = db.execute(
        select(Document).where(Document.entity_type == entity_type, Document.entity_id == entity_id, Document.kind == kind)
        .order_by(Document.created_at)
    ).scalars().all()
    return [DocumentOut.model_validate(d) for d in rows]


@router.get("/attachments/{entity_type}/{entity_id}", response_model=list[DocumentOut])
def list_attachments(entity_type: str, entity_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    kind, _, view = _target(entity_type)
    _check(user, view)
    _entity(db, entity_type, entity_id)
    return _list(db, entity_type, entity_id, kind)


@router.delete("/attachments/file/{document_id}", status_code=204)
def delete_attachment(document_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    doc = db.get(Document, document_id)
    target = {"quote_scan": "quote", "invoice_scan": "invoice"}.get(doc.kind if doc else "")
    if doc is None or target is None:
        raise HTTPException(404, detail="not_found")
    _check(user, TARGETS[target][1])
    try:
        absolute_path(doc).unlink(missing_ok=True)
    except HTTPException:
        pass
    log_activity(db, user, "attachment.deleted", doc.entity_type, doc.entity_id, summary=doc.filename, ip=client_ip(request))
    db.delete(doc)
    db.commit()
