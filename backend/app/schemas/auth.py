from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str
    organization_name: str = Field(min_length=2, max_length=200)

    @field_validator("full_name", "organization_name")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Giá trị không được để trống")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not any(c.islower() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ thường")
        if not any(c.isupper() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ hoa")
        if not any(c.isdigit() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ số")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("Mật khẩu xác nhận không khớp")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)


class LogoutRequest(RefreshRequest):
    pass


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not any(c.islower() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ thường")
        if not any(c.isupper() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ hoa")
        if not any(c.isdigit() for c in value):
            raise ValueError("Mật khẩu cần ít nhất một chữ số")
        return value


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime
    session_expires_at: datetime


class OrganizationSummary(BaseModel):
    id: UUID
    name: str
    role: str


class CurrentUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_super_admin: bool
    organizations: list[OrganizationSummary]
