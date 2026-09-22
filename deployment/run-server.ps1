$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$PythonExe = Join-Path $BackendRoot ".venv\Scripts\python.exe"
$StopMarker = Join-Path $RuntimeRoot "server.stop"

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
Remove-Item -LiteralPath $StopMarker -Force -ErrorAction SilentlyContinue

function Test-ServerProcess([string]$Name, [string]$ExpectedArgument) {
    $pidPath = Join-Path $RuntimeRoot "$Name.pid"
    if (-not (Test-Path $pidPath)) { return $false }
    $savedPid = [int](Get-Content $pidPath -ErrorAction SilentlyContinue)
    if (-not $savedPid) { return $false }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid"
    return $process -and $process.ExecutablePath -eq $PythonExe `
        -and $process.CommandLine -like "*$ExpectedArgument*"
}

function Start-ServerProcess([string]$Name, [string[]]$Arguments, [string]$ExpectedArgument) {
    if (Test-ServerProcess $Name $ExpectedArgument) { return }
    $stdout = Join-Path $RuntimeRoot "$Name.out.log"
    $stderr = Join-Path $RuntimeRoot "$Name.err.log"
    $process = Start-Process -FilePath $PythonExe -ArgumentList $Arguments `
        -WorkingDirectory $BackendRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -Path (Join-Path $RuntimeRoot "$Name.pid") -Value $process.Id
}

if (-not (Test-Path $PythonExe)) { throw "Python virtual environment is missing." }
if (-not (Test-Path (Join-Path $BackendRoot ".env"))) { throw "Production .env is missing." }
if (-not (Test-Path (Join-Path $ProjectRoot "frontend\dist\index.html"))) {
    throw "Frontend production build is missing. Run deployment/deploy-server.ps1."
}

Start-ServerProcess "server-backend" @(
    "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000",
    "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"
) "uvicorn"
Start-ServerProcess "server-document-worker" @("-m", "app.workers.documents") "app.workers.documents"
Start-ServerProcess "server-notification-worker" @(
    "-m", "app.workers.notifications"
) "app.workers.notifications"
