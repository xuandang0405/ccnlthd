$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$PythonExe = Join-Path $BackendRoot ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

function Test-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Wait-Url([string]$Name, [string]$Url, [int]$Attempts = 40) {
    for ($index = 1; $index -le $Attempts; $index++) {
        if (Test-Url $Url) {
            Write-Host "      $Name da san sang."
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "$Name khong san sang tai $Url"
}

function Start-LocalProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
) {
    $pidPath = Join-Path $RuntimeRoot "$Name.pid"
    if (Test-Path $pidPath) {
        $savedPid = [int](Get-Content $pidPath -ErrorAction SilentlyContinue)
        if ($savedPid -and (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
            Write-Host "      $Name dang chay (PID $savedPid)."
            return
        }
    }
    $stdout = Join-Path $RuntimeRoot "$Name.out.log"
    $stderr = Join-Path $RuntimeRoot "$Name.err.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -Path $pidPath -Value $process.Id
    Write-Host "      Da khoi dong $Name (PID $($process.Id))."
}

Write-Host "[1/6] Kiem tra Python va Node.js..."
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay Python 3.12+. Hay cai Python va chon Add Python to PATH."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay Node.js/npm. Hay cai Node.js 20+."
}

if (-not (Test-Path $PythonExe)) {
    Write-Host "      Tao Python virtual environment..."
    & python -m venv (Join-Path $BackendRoot ".venv")
}

Write-Host "[2/6] Kiem tra thu vien Backend..."
& $PythonExe -c "import fastapi, pymongo" 2>$null
if ($LASTEXITCODE -ne 0) {
    & $PythonExe -m pip install -e "${BackendRoot}[dev]"
    if ($LASTEXITCODE -ne 0) { throw "Khong cai duoc thu vien Backend." }
}

Write-Host "[3/6] Kiem tra thu vien Frontend..."
if (-not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    & npm.cmd ci --prefix $FrontendRoot
    if ($LASTEXITCODE -ne 0) { throw "Khong cai duoc thu vien Frontend." }
}

$secretPath = Join-Path $RuntimeRoot "local-secret.txt"
if (-not (Test-Path $secretPath)) {
    $secret = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    Set-Content -Path $secretPath -Value $secret -NoNewline
}

$env:APP_ENV = "development"
$env:APP_SECRET_KEY = Get-Content $secretPath -Raw
$env:APP_PUBLIC_URL = "http://127.0.0.1:5173"
$env:FRONTEND_ORIGIN = "http://127.0.0.1:5173"
$env:DATABASE_BACKEND = "mongodb"
$env:RATE_LIMIT_BACKEND = "mongodb"
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
$env:UPLOAD_DIR = "storage/uploads"

Write-Host "[4/6] Kiem tra MongoDB Atlas..."
Push-Location $BackendRoot
try {
    & $PythonExe (Join-Path $PSScriptRoot "prepare-mongodb.py")
    if ($LASTEXITCODE -ne 0) { throw "Khong the ket noi MongoDB." }
} finally {
    Pop-Location
}

Write-Host "[5/6] Khoi dong Backend, workers va Frontend..."
if (-not (Test-Url "http://127.0.0.1:8000/health/ready")) {
    Start-LocalProcess "backend" $PythonExe @(
        "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"
    ) $BackendRoot
}
Start-LocalProcess "document-worker" $PythonExe @("-m", "app.workers.documents") $BackendRoot
Start-LocalProcess "notification-worker" $PythonExe @("-m", "app.workers.notifications") $BackendRoot
if (-not (Test-Url "http://127.0.0.1:5173")) {
    $npmExe = (Get-Command npm.cmd).Source
    Start-LocalProcess "frontend" $npmExe @("run", "dev", "--", "--host", "127.0.0.1") $FrontendRoot
}

Write-Host "[6/6] Cho he thong san sang..."
try {
    Wait-Url "Backend" "http://127.0.0.1:8000/health/ready"
    Wait-Url "Frontend" "http://127.0.0.1:5173"
} catch {
    Write-Host ""
    Write-Host "Khoi dong that bai. Log nam tai $RuntimeRoot"
    Get-ChildItem $RuntimeRoot -Filter "*.err.log" | ForEach-Object {
        Write-Host "--- $($_.Name) ---"
        Get-Content $_.FullName -Tail 20
    }
    throw
}

Write-Host ""
Write-Host "He thong da san sang (che do khong Docker)."
Write-Host "Website: http://127.0.0.1:5173"
Write-Host "API docs: http://127.0.0.1:8000/docs"
Write-Host "Du lieu: MongoDB Atlas"
Write-Host "Log: .runtime\"
Write-Host "Luu y: quota bo nho se dat lai khi Backend khoi dong lai."
Start-Process "http://127.0.0.1:5173"
