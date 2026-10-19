import json
import logging
import re
from datetime import UTC, datetime
from uuid import uuid4

REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9_.-]{1,128}")


def safe_request_id(value: str | None) -> str:
    return value if value and REQUEST_ID_PATTERN.fullmatch(value) else str(uuid4())


class RequestLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
                "level": record.levelname,
                "event": "http_request",
                "request_id": record.request_id,
                "method": record.method,
                "path": record.path,
                "status": record.status,
                "duration_ms": record.duration_ms,
            },
            ensure_ascii=False,
        )


def configure_request_logging() -> logging.Logger:
    logger = logging.getLogger("app.access")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(RequestLogFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger
