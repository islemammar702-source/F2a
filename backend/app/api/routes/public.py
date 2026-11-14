"""Public website endpoints (no authentication): company info, quote request & contact forms."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import client_ip
from app.db.session import get_db
from app.models import Document, QuoteRequest
from app.schemas.system import ContactIn, PublicCompanyOut, QuoteRequestIn
from app.services.audit import log_activity, notify_permission
from app.services.ratelimit import RateLimiter
from app.services.settings_service import get_company_settings
from app.services.storage import absolute_path

router = APIRouter(prefix="/public", tags=["public"])
form_limiter = RateLimiter(5, 3600)


@router.get("/company", response_model=PublicCompanyOut)
def company(db: Session = Depends(get_db)):
    cs = get_company_settings(db)
    db.commit()
    return PublicCompanyOut.model_validate(cs).model_copy(update={"has_logo": cs.logo_document_id is not None})


@router.get("/logo")
def logo(db: Session = Depends(get_db)):
    cs = get_company_settings(db)
    doc = db.get(Document, cs.logo_document_id) if cs.logo_document_id else None
    if doc is None:
        raise HTTPException(404, detail="no_logo")
    return FileResponse(absolute_path(doc), media_type=doc.mime_type, headers={"Cache-Control": "public, max-age=3600"})


def _guard(request: Request, honeypot: str | None) -> None:
    if honeypot:
        raise HTTPException(400, detail="invalid_submission")
    key = client_ip(request) or "?"
    if form_limiter.is_blocked(key):
        raise HTTPException(429, detail="too_many_attempts")
    form_limiter.hit(key)


@router.post("/quote-request", status_code=201)
def quote_request(data: QuoteRequestIn, request: Request, db: Session = Depends(get_db)):
    _guard(request, data.website)
    req = QuoteRequest(name=data.name, phone=data.phone, email=data.email, service=data.service, address=data.address,
                       message=data.message, status="new")
    db.add(req)
    db.flush()
    log_activity(db, None, "request.created", "request", req.id, summary=req.name, ip=client_ip(request))
    notify_permission(db, "requests.view", "request.created", {"name": req.name, "service": req.service}, "/requests")
    db.commit()
    return {"detail": "request_received", "id": str(req.id)}


@router.post("/contact", status_code=201)
def contact(data: ContactIn, request: Request, db: Session = Depends(get_db)):
    _guard(request, data.website)
    req = QuoteRequest(name=data.name, phone=data.phone, email=data.email, service="contact", message=data.message,
                       status="new")
    db.add(req)
    db.flush()
    notify_permission(db, "requests.view", "request.created", {"name": req.name, "service": "contact"}, "/requests")
    db.commit()
    return {"detail": "message_received"}
