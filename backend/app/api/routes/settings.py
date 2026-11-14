"""Company settings, logo, quote requests (back-office) and document downloads."""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_current_user, require_permission
from app.db.session import get_db
from app.models import Document, QuoteRequest, User
from app.schemas.common import Page
from app.schemas.system import CompanySettingsOut, CompanySettingsUpdate, QuoteRequestOut, QuoteRequestUpdate
from app.services.audit import log_activity
from app.services.settings_service import get_company_settings
from app.services.storage import absolute_path, save_upload

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=CompanySettingsOut)
def read_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cs = get_company_settings(db)
    db.commit()
    return cs


@router.patch("/settings", response_model=CompanySettingsOut)
def update_settings(data: CompanySettingsUpdate, request: Request, db: Session = Depends(get_db),
                    actor: User = Depends(require_permission("settings.manage"))):
    cs = get_company_settings(db)
    payload = data.model_dump(exclude_unset=True)
    if "payment_methods" in payload and payload["payment_methods"] is not None:
        codes = [m["code"] for m in payload["payment_methods"]]
        if len(codes) != len(set(codes)):
            raise HTTPException(400, detail="duplicate_payment_method")
        if not any(m["active"] for m in payload["payment_methods"]):
            raise HTTPException(400, detail="no_active_payment_method")
    if payload.get("tax_rates") is not None:
        payload["tax_rates"] = sorted({float(r) for r in payload["tax_rates"]})
    rates = payload.get("tax_rates", cs.tax_rates)
    default = payload.get("default_tax_rate", cs.default_tax_rate)
    if float(default) not in [float(r) for r in rates]:
        raise HTTPException(400, detail="default_rate_not_in_list")
    for k, v in payload.items():
        if v is None and k in ("name", "tax_rates", "payment_methods", "default_tax_rate", "stamp_duty", "apply_stamp_duty",
                               "quote_prefix", "invoice_prefix", "payment_prefix", "number_padding",
                               "quote_validity_days", "invoice_due_days"):
            continue
        setattr(cs, k, v)
    log_activity(db, actor, "settings.updated", "settings", None, summary="company_settings",
                 details={"fields": sorted(payload)}, ip=client_ip(request))
    db.commit()
    return cs


@router.post("/settings/logo", response_model=CompanySettingsOut)
async def upload_logo(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                      actor: User = Depends(require_permission("settings.manage"))):
    if (file.content_type or "") not in ("image/png", "image/jpeg"):
        raise HTTPException(400, detail="file_type_not_allowed")
    doc = await save_upload(db, file, kind="logo", entity_type="settings", user_id=actor.id)
    cs = get_company_settings(db)
    cs.logo_document_id = doc.id
    log_activity(db, actor, "settings.logo_updated", "settings", None, ip=client_ip(request))
    db.commit()
    return cs


@router.delete("/settings/logo", response_model=CompanySettingsOut)
def delete_logo(db: Session = Depends(get_db), _: User = Depends(require_permission("settings.manage"))):
    cs = get_company_settings(db)
    cs.logo_document_id = None
    db.commit()
    return cs


# ---------------- Quote requests (back office) ----------------
@router.get("/requests", response_model=Page[QuoteRequestOut])
def list_requests(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  db: Session = Depends(get_db), _: User = Depends(require_permission("requests.view"))):
    stmt = select(QuoteRequest)
    if status:
        stmt = stmt.where(QuoteRequest.status == status)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(QuoteRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.patch("/requests/{request_id}", response_model=QuoteRequestOut)
def update_request(request_id: uuid.UUID, data: QuoteRequestUpdate, request: Request, db: Session = Depends(get_db),
                   actor: User = Depends(require_permission("requests.manage"))):
    req = db.get(QuoteRequest, request_id)
    if req is None:
        raise HTTPException(404, detail="not_found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(req, k, v)
    log_activity(db, actor, "request.updated", "request", req.id, summary=req.name, ip=client_ip(request))
    db.commit()
    return req


# ---------------- Document download (authorised) ----------------
@router.get("/documents/{document_id}")
def download_document(document_id: uuid.UUID, download: bool = Query(True), db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, detail="not_found")
    perms = user.permission_codes
    if user.role.is_client_role:
        if doc.client_id is None or doc.client_id != user.client_id or doc.kind == "logo":
            raise HTTPException(404, detail="not_found")  # do not leak existence
    else:
        needed = {"quote_pdf": "quotes.view", "invoice_pdf": "invoices.view", "payment_proof": "payments.view"}.get(doc.kind)
        if needed and needed not in perms:
            raise HTTPException(403, detail="forbidden")
    path = absolute_path(doc)
    if not path.exists():
        raise HTTPException(404, detail="file_missing")
    return FileResponse(path, media_type=doc.mime_type, filename=doc.filename,
                        content_disposition_type="attachment" if download else "inline",
                        headers={"Cache-Control": "private, no-store"})
