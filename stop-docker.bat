@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.docker" (
    echo Chua co .env.docker.
    pause
    exit /b 1
)
docker compose --env-file .env.docker -f docker-compose.yml stop --timeout 30
set "STOP_EXIT_CODE=%ERRORLEVEL%"
echo Du lieu database va upload van duoc giu nguyen.
pause
exit /b %STOP_EXIT_CODE%
