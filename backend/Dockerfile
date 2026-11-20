FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
# Free offline reading of scanned documents: Tesseract OCR (French + Arabic) and PDF tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra tesseract-ocr-ara poppler-utils \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 1000 f2a
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=f2a:f2a . .
RUN mkdir -p /app/storage && chown f2a:f2a /app/storage
USER f2a
EXPOSE 8000
# Apply migrations, seed reference data (idempotent), then start the API
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers 2"]
