from pydantic import BaseModel, JsonValue


class ErrorResponse(BaseModel):
    # Giữ detail để frontend cũ vẫn đọc được chuỗi lỗi hoặc danh sách lỗi form.
    detail: JsonValue
    message: str
    error_code: str
    status_code: int
    request_id: str
