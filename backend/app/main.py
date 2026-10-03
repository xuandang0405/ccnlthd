import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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
    tickets,
)
from app.core.config import get_settings
from app.core.mongodb import close_mongo_client, ensure_mongo_indexes, get_mongo_database
from app.core.redis import (
    InMemoryRedis,
    MongoRateLimitStore,
    SqliteRateLimitStore,
    create_redis_client,
)

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    await ensure_mongo_indexes()
    try:
        yield
    finally:
        await close_mongo_client()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    lifespan=lifespan,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
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
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After",
    ],
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
    if request.url.path.startswith("/widget/"):
        response.headers["Content-Security-Policy"] = "frame-ancestors *"
    else:
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
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
        await get_mongo_database().command("ping")
        components["database"] = "up"
    except Exception as exc:
        logging.getLogger("app.health").warning("Database readiness failed: %s", type(exc).__name__)
    redis = create_redis_client()
    try:
        if await redis.ping():
            if isinstance(redis, InMemoryRedis):
                components["redis"] = "memory (development only)"
            elif isinstance(redis, MongoRateLimitStore):
                components["redis"] = "mongodb"
            elif isinstance(redis, SqliteRateLimitStore):
                components["redis"] = "sqlite (single-server mode)"
            else:
                components["redis"] = "up"
    except Exception as exc:
        logging.getLogger("app.health").warning("Redis readiness failed: %s", type(exc).__name__)
    finally:
        if not isinstance(redis, (InMemoryRedis, SqliteRateLimitStore, MongoRateLimitStore)):
            await redis.aclose()
    healthy = components["database"] == "up" and components["redis"] != "down"
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
app.include_router(tickets.router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["Monitoring"])
async def report_compatible_health():
    return await readiness()


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
frontend_assets = frontend_dist / "assets"
if frontend_assets.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_assets), name="frontend-assets")


@app.get("/", include_in_schema=False)
async def frontend_index():
    index = frontend_dist / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Frontend chưa được build")
    return FileResponse(index)


@app.get("/{frontend_path:path}", include_in_schema=False)
async def frontend_spa(frontend_path: str):
    if frontend_path.startswith(("api/", "health/", "docs", "redoc", "openapi.json")):
        raise HTTPException(status_code=404, detail="Không tìm thấy endpoint")
    candidate = (frontend_dist / frontend_path).resolve()
    if frontend_dist.resolve() in candidate.parents and candidate.is_file():
        return FileResponse(candidate)
    index = frontend_dist / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Frontend chưa được build")
    return FileResponse(index)
