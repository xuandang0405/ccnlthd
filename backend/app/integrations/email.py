import smtplib
from email.message import EmailMessage

from anyio import to_thread

from app.core.config import get_settings


class EmailConfigurationError(RuntimeError):
    pass


async def send_password_reset(recipient: str, reset_url: str) -> None:
    settings = get_settings()
    if not settings.email_enabled:
        raise EmailConfigurationError("Email chưa được bật")
    if not all(
        [settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from]
    ):
        raise EmailConfigurationError("Cấu hình SMTP chưa đầy đủ")
    message = EmailMessage()
    message["Subject"] = "Đặt lại mật khẩu AI Sales Assistant"
    message["From"] = settings.smtp_from
    message["To"] = recipient
    message.set_content(
        "Bạn đã yêu cầu đặt lại mật khẩu. Liên kết chỉ sử dụng một lần và hết hạn sau "
        f"30 phút:\n\n{reset_url}\n\nNếu không yêu cầu, hãy bỏ qua email này."
    )

    def send() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
            smtp.send_message(message)

    await to_thread.run_sync(send)
