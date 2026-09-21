import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import text

from app.api import (
    admin,
    auth,
    chatbots,
    dashboard,
    documents,
    operations,
    payments,
    public_chat,
    telegram,
)
from app.core.config import get_settings
from app.core.database import SessionFactory

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Organization-ID",
        "X-Request-ID",
        "X-Visitor-Token",
        "X-Widget-Origin",
    ],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger("app").exception("Unhandled request error request_id=%s", request_id)
        response = JSONResponse(
            status_code=500, content={"detail": "Lỗi hệ thống", "request_id": request_id}
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    logging.getLogger("app.access").info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response


@app.get("/health/live", tags=["Monitoring"])
async def liveness():
    return {"status": "ok"}


@app.get("/health/ready", tags=["Monitoring"])
async def readiness():
    components = {"database": "down", "redis": "down"}
    try:
        async with SessionFactory() as db:
            await db.execute(text("SELECT 1"))
        components["database"] = "up"
    except Exception as exc:
        logging.getLogger("app.health").warning("Database readiness failed: %s", type(exc).__name__)
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        if await redis.ping():
            components["redis"] = "up"
    except Exception as exc:
        logging.getLogger("app.health").warning("Redis readiness failed: %s", type(exc).__name__)
    finally:
        await redis.aclose()
    healthy = all(value == "up" for value in components.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ready" if healthy else "not_ready", "components": components},
    )


app.include_router(auth.router, prefix="/api/v1")
app.include_router(chatbots.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(public_chat.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(operations.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(telegram.router, prefix="/api/v1")
