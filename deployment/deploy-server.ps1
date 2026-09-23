$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$PythonExe = Join-Path $BackendRoot ".venv\Scripts\python.exe"
$DeployLock = Join-Path $RuntimeRoot "deploy.lock"

New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot "backups") | Out-Null
Set-Content -Path $DeployLock -Value $PID

try {
    & (Join-Path $PSScriptRoot "stop-server.ps1") -ForDeployment

& (Join-Path $PSScriptRoot "backup-server.ps1")

& npm.cmd ci --prefix $FrontendRoot
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
& npm.cmd run build --prefix $FrontendRoot
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

Push-Location $BackendRoot
try {
    & $PythonExe (Join-Path $PSScriptRoot "prepare-mongodb.py")
    if ($LASTEXITCODE -ne 0) { throw "MongoDB preparation failed." }
} finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot "run-server.ps1")

for ($attempt = 1; $attempt -le 40; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/ready" -TimeoutSec 2
        if ($health.status -eq "ready") { break }
    } catch {}
    Start-Sleep -Seconds 2
}
if ($health.status -ne "ready") { throw "Server readiness check failed." }

    Write-Host "Server is ready at https://seminar.bkpvp.top"
} finally {
    Remove-Item -LiteralPath $DeployLock -Force -ErrorAction SilentlyContinue
}
