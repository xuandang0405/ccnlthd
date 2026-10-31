import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import JsonValue
from starlette.exceptions import HTTPException

from app.schemas.error import ErrorResponse

ERROR_RESPONSES = {
    status: {"model": ErrorResponse}
    for status in (400, 401, 402, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503)
}


def error_response(
    request: Request,
    status_code: int,
    detail: JsonValue,
    error_code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid4())
    request.state.request_id = request_id
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "message": message,
            "error_code": error_code,
            "status_code": status_code,
            "request_id": request_id,
        },
        headers={**(headers or {}), "X-Request-ID": request_id},
    )


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Yêu cầu không thành công"
    return error_response(
        request, exc.status_code, exc.detail, f"HTTP_{exc.status_code}", message, exc.headers
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # input/ctx có thể chứa mật khẩu hoặc object không tuần tự hóa được.
    details = [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return error_response(
        request, 422, details, "VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ"
    )


async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    response = error_response(
        request, 500, "Lỗi hệ thống", "INTERNAL_ERROR", "Lỗi hệ thống"
    )
    # Không ghi body, token hay nội dung exception có thể chứa secret vào log.
    logging.getLogger("app.errors").error(
        "request_id=%s method=%s path=%s exception_type=%s",
        request.state.request_id,
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, internal_error_handler)
