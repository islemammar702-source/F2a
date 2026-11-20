"""Material / price catalogue: search (while typing a quote/invoice line), CRUD, Excel import / export."""
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_db, require_any_permission, require_permission
from app.models import CatalogItem, User
from app.services import catalog as svc
from app.services.audit import log_activity

router = APIRouter(prefix="/catalog", tags=["catalog"])
can_use = require_any_permission("quotes.manage", "invoices.manage", "catalog.manage")
can_manage = require_permission("catalog.manage")


class CatalogIn(BaseModel):
    reference: str = Field(min_length=1, max_length=64)
    designation: str = Field(min_length=1, max_length=255)
    unit: str = Field("u", pattern="^(u|ml|m2|m3|kg|h|j|forfait|lot)$")
    unit_price_ht: Decimal = Field(ge=0, max_digits=12, decimal_places=3)
    item_type: str = Field("material", pattern="^(service|material|labor)$")
    category: str | None = Field(None, max_length=100)
    tva_rate: Decimal | None = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)
    is_active: bool = True


class CatalogOut(CatalogIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


@router.get("", response_model=list[CatalogOut])
def search(q: str = Query("", max_length=100), limit: int = Query(20, ge=1, le=1000), all: bool = False,
           db: Session = Depends(get_db), _: User = Depends(can_use)):
    stmt = select(CatalogItem)
    if not all:
        stmt = stmt.where(CatalogItem.is_active.is_(True))
    for word in q.split()[:6]:  # every word must appear (reference, designation or category)
        like = f"%{word}%"
        stmt = stmt.where(or_(CatalogItem.designation.ilike(like), CatalogItem.reference.ilike(like),
                              CatalogItem.category.ilike(like)))
    stmt = stmt.order_by(func.coalesce(CatalogItem.category, ""), CatalogItem.designation).limit(limit)
    return db.execute(stmt).scalars().all()


def _check_unique(db: Session, ref: str, exclude: uuid.UUID | None = None):
    stmt = select(CatalogItem.id).where(func.lower(CatalogItem.reference) == ref.lower())
    if exclude:
        stmt = stmt.where(CatalogItem.id != exclude)
    if db.scalar(stmt):
        raise HTTPException(400, detail="catalog_reference_exists")


@router.post("", response_model=CatalogOut, status_code=201)
def create(data: CatalogIn, request: Request, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    _check_unique(db, data.reference)
    item = CatalogItem(**data.model_dump())
    db.add(item)
    db.flush()
    log_activity(db, actor, "catalog.created", "catalog", item.id, summary=item.designation, ip=client_ip(request))
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=CatalogOut)
def update(item_id: uuid.UUID, data: CatalogIn, request: Request, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    item = db.get(CatalogItem, item_id)
    if item is None:
        raise HTTPException(404, detail="not_found")
    _check_unique(db, data.reference, exclude=item.id)
    for k, v in data.model_dump().items():
        setattr(item, k, v)
    log_activity(db, actor, "catalog.updated", "catalog", item.id, summary=item.designation, ip=client_ip(request))
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete(item_id: uuid.UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    item = db.get(CatalogItem, item_id)
    if item is None:
        raise HTTPException(404, detail="not_found")
    log_activity(db, actor, "catalog.deleted", "catalog", item.id, summary=item.designation, ip=client_ip(request))
    db.delete(item)  # quote / invoice lines keep their own copy of designation and price
    db.commit()


@router.post("/import")
async def import_excel(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                       actor: User = Depends(can_manage)):
    data = await file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, detail="file_too_large")
    if not data.startswith(b"PK"):  # .xlsx files are zip archives
        raise HTTPException(400, detail="invalid_excel")
    result = svc.import_xlsx(db, data)
    if "error" in result:
        db.rollback()
        raise HTTPException(400, detail=result["error"])
    log_activity(db, actor, "catalog.imported", "catalog", None,
                 summary=f"{result['created']} créés, {result['updated']} mis à jour", ip=client_ip(request))
    db.commit()
    return result


@router.get("/export")
def export_excel(db: Session = Depends(get_db), _: User = Depends(can_manage)):
    return Response(svc.export_xlsx(db), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="catalogue_materiel_F2A.xlsx"'})
