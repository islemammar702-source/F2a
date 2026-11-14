from sqlalchemy.orm import Session

from app.models import CompanySettings


def get_company_settings(db: Session) -> CompanySettings:
    cs = db.get(CompanySettings, 1)
    if cs is None:
        cs = CompanySettings(id=1)
        db.add(cs)
        db.flush()
    return cs
