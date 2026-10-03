@echo off
setlocal EnableExtensions
title AI Sales Assistant - Production Server
cd /d "%~dp0"

echo.
echo ============================================================
echo          AI SALES ASSISTANT - PRODUCTION SERVER
echo ============================================================
echo.
echo Khi cua so nay mo, website se hoat dong.
echo Khi dong cua so hoac nhan Ctrl+C, website se dung.
echo Cac tien trinh cu cua dung du an se duoc don dep truoc khi chay.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-server-foreground.ps1"
set "RUN_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%RUN_EXIT_CODE%"=="0" (
    echo [LOI] Khong the chay day du server.
    echo       Hay xem thong bao loi phia tren.
) else (
    echo [THONG TIN] Server da dung.
)
echo.
pause
exit /b %RUN_EXIT_CODE%
