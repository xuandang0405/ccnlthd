@echo off
setlocal
title Tro Ly Viet - Docker
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\run-docker.ps1"
set "RUN_EXIT_CODE=%ERRORLEVEL%"
echo [THONG TIN] Docker da dung. Neu khoi dong that bai, hay xem log phia tren.
pause
exit /b %RUN_EXIT_CODE%
