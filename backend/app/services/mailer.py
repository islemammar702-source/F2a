"""Optional SMTP email sending. If SMTP is not configured, nothing is sent and False is returned."""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("f2a.mail")


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def send_email(to: str, subject: str, body: str, attachments: list[tuple[str, bytes, str]] | None = None) -> bool:
    if not smtp_configured():
        log.info("SMTP not configured – email to %s not sent (%s)", to, subject)
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    for name, data, mime in attachments or []:
        maintype, subtype = mime.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
            if settings.SMTP_TLS:
                s.starttls()
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception:  # noqa: BLE001
        log.exception("Email sending failed")
        return False
