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
echo.
echo [CAC LINK CUA DU AN]
echo        Trang chu          : http://127.0.0.1:5173/
echo        Dang nhap User     : http://127.0.0.1:5173/login
echo        Dashboard User     : http://127.0.0.1:5173/app
echo        Trang quan tri     : http://127.0.0.1:5173/admin
echo        Test Widget        : http://127.0.0.1:5173/widget-test.html
echo        Widget Script      : http://127.0.0.1:5173/widget.js
echo        Tai lieu API       : http://127.0.0.1:8001/docs
echo        Kiem tra Backend   : http://127.0.0.1:8001/health/ready
echo.
echo        Database : MongoDB Atlas / ai_sales_assistant_local
echo        Log se hien truc tiep trong cua so nay.
echo        GIU CUA SO NAY MO DE WEBSITE HOAT DONG.
echo        Nhan Ctrl+C de dung toan bo dich vu local.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-local.ps1"
if errorlevel 1 goto :failed

echo.
echo [THONG TIN] Phien run.bat da ket thuc.
exit /b 0

:server
echo [MODE] PRODUCTION SERVER
echo.
echo [CAC LINK PRODUCTION]
echo        Trang chu          : https://seminar.bkpvp.top/
echo        Dang nhap User     : https://seminar.bkpvp.top/login
echo        Dashboard User     : https://seminar.bkpvp.top/app
echo        Trang quan tri     : https://seminar.bkpvp.top/admin
echo        Test Widget        : https://seminar.bkpvp.top/widget-test.html
echo        Widget Script      : https://seminar.bkpvp.top/widget.js
echo        Tai lieu API local : http://127.0.0.1:8000/docs
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
