FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN addgroup --system --gid 10001 app && adduser --system --uid 10001 --ingroup app app \
    && mkdir -p /data/uploads && chown -R app:app /data/uploads

COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations
RUN pip install .

# Backend và worker tài liệu dùng chung UID để đọc được file upload sau khi build lại.
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
