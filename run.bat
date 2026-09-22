@echo off
setlocal EnableExtensions EnableDelayedExpansion
title AI Sales Assistant - Startup
cd /d "%~dp0"

echo.
echo ============================================================
echo              AI SALES ASSISTANT - STARTUP
echo ============================================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
    goto :local
)

docker compose version >nul 2>&1
if errorlevel 1 (
    goto :local
)

docker info >nul 2>&1
if errorlevel 1 (
    goto :local
)

if not exist ".env" (
    echo [1/5] Tao cau hinh .env lan dau...
    copy /Y ".env.example" ".env" >nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$path = [IO.Path]::GetFullPath('.env');" ^
      "$text = [IO.File]::ReadAllText($path);" ^
      "$secret = ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'));" ^
      "$dbPassword = [Guid]::NewGuid().ToString('N');" ^
      "$text = $text.Replace('APP_ENV=development', 'APP_ENV=production');" ^
      "$text = $text.Replace('APP_SECRET_KEY=replace-with-at-least-32-random-characters', 'APP_SECRET_KEY=' + $secret);" ^
      "$text = $text.Replace('APP_PUBLIC_URL=http://localhost:8080', 'APP_PUBLIC_URL=http://localhost');" ^
      "$text = $text.Replace('FRONTEND_ORIGIN=http://localhost:5173', 'FRONTEND_ORIGIN=http://localhost');" ^
      "$text = $text.Replace('APP_DOMAIN=localhost', 'APP_DOMAIN=http://localhost');" ^
      "$text = $text.Replace('POSTGRES_PASSWORD=change-me', 'POSTGRES_PASSWORD=' + $dbPassword);" ^
      "$text = $text.Replace('sales_assistant:change-me@postgres', 'sales_assistant:' + $dbPassword + '@postgres');" ^
      "[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false));"
    if errorlevel 1 (
        echo [LOI] Khong tao duoc file .env.
        goto :failed
    )
    echo       Da tao APP_SECRET_KEY va mat khau PostgreSQL ngau nhien.
) else (
    echo [1/5] Su dung file .env hien co.
)

echo [2/5] Kiem tra cau hinh Docker Compose...
docker compose config --quiet
if errorlevel 1 (
    echo [LOI] Cau hinh .env hoac docker-compose.yml khong hop le.
    goto :failed
)

echo [3/5] Build va khoi dong tat ca dich vu...
docker compose up -d --build
if errorlevel 1 (
    echo [LOI] Docker khong the build hoac khoi dong du an.
    docker compose ps
    goto :failed
)

echo [4/5] Cho database, Redis va Backend san sang...
set "READY=0"
for /L %%I in (1,1,40) do (
    docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/ready', timeout=3)" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto :ready
    )
    timeout /t 3 /nobreak >nul
)

:ready
if "!READY!"=="0" (
    echo [LOI] He thong khong dat trang thai san sang sau 120 giay.
    echo.
    docker compose ps
    echo.
    echo Log Backend gan nhat:
    docker compose logs --tail 80 backend
    goto :failed
)

echo [5/5] He thong da san sang.
echo.
docker compose ps
echo.
echo Website:  http://localhost
echo Health:   http://localhost/health/ready
echo.
echo Luu y: Gemini, Telegram, SMTP va SePay chi hoat dong sau khi
echo ban dien credentials that vao file .env va chay lai run.bat.
echo.
start "" "http://localhost"
echo Ban co the dong cua so nay. Cac container se tiep tuc chay nen.
pause
exit /b 0

:local
echo [INFO] Docker khong kha dung. Chuyen sang che do Windows khong Docker...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-local.ps1"
if errorlevel 1 goto :failed
pause
exit /b 0

:failed
echo.
echo Khoi dong that bai. Du an chua bi xoa hay reset du lieu.
echo Xem huong dan tai docs\INSTALLATION.md va docs\OPERATIONS.md.
echo.
pause
exit /b 1
