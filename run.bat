@echo off
setlocal EnableExtensions
title AI Sales Assistant - Full Project Launcher
cd /d "%~dp0"

echo.
echo ============================================================
echo              AI SALES ASSISTANT - STARTUP
echo ============================================================
echo.

if /I "%~1"=="server" goto :server

:local
echo [MODE] LOCAL TEST
echo        Frontend : http://127.0.0.1:5173
echo        Backend  : http://127.0.0.1:8001
echo        Database : MongoDB Atlas / ai_sales_assistant_local
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-local.ps1"
if errorlevel 1 goto :failed

echo.
echo [OK] Toan bo du an da san sang.
echo      Website  : http://127.0.0.1:5173
echo      API docs : http://127.0.0.1:8001/docs
echo      Log      : %~dp0.runtime\
echo.
echo Ban co the dong cua so nay; cac tien trinh van tiep tuc chay nen.
pause
exit /b 0

:server
echo [MODE] PRODUCTION SERVER
echo        Website: https://seminar.bkpvp.top
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-server.ps1"
if errorlevel 1 goto :failed

for /L %%I in (1,1,30) do (
    powershell.exe -NoProfile -Command ^
      "try { $r = Invoke-RestMethod 'http://127.0.0.1:8000/health/ready' -TimeoutSec 2; if ($r.status -eq 'ready') { exit 0 } } catch {}; exit 1"
    if not errorlevel 1 goto :server_ready
    timeout /t 2 /nobreak >nul
)

echo [LOI] Server khong dat trang thai ready sau 60 giay.
goto :failed

:server_ready
start "" "https://seminar.bkpvp.top"
echo [OK] Production server da san sang.
pause
exit /b 0

:failed
echo.
echo [LOI] Khong the khoi dong day du du an.
echo       Xem log trong thu muc: %~dp0.runtime\
echo       Du lieu MongoDB khong bi xoa hay reset.
echo.
pause
exit /b 1
