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

function Get-DescendantProcessIds([int]$RootPid) {
    $allProcesses = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $descendants = @()
    $parents = @($RootPid)
    while ($parents.Count -gt 0) {
        $children = @($allProcesses | Where-Object { $parents -contains [int]$_.ParentProcessId })
        if ($children.Count -eq 0) { break }
        $childIds = @($children | ForEach-Object { [int]$_.ProcessId })
        $descendants += $childIds
        $parents = $childIds
    }
    return $descendants
}

function Stop-LocalProcess([string]$Name) {
    $pidPath = Join-Path $RuntimeRoot "$Name.pid"
    if (-not (Test-Path $pidPath)) { return }

    $savedPid = 0
    [void][int]::TryParse((Get-Content $pidPath -ErrorAction SilentlyContinue), [ref]$savedPid)
    if ($savedPid -gt 0 -and (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
        $descendants = @(Get-DescendantProcessIds $savedPid)
        [array]::Reverse($descendants)
        foreach ($processId in $descendants) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $savedPid -Force -ErrorAction SilentlyContinue
        Write-Host "      Da dung phien $Name cu (PID $savedPid)."
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

function Start-ForegroundProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
) {
    $pidPath = Join-Path $RuntimeRoot "$Name.pid"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
    Set-Content -Path $pidPath -Value $process.Id
    Write-Host "      Da khoi dong $Name (PID $($process.Id))."
    return [PSCustomObject]@{ Name = $Name; Process = $process }
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
$env:MONGODB_DATABASE = "ai_sales_assistant_local"
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
$processNames = @("backend", "document-worker", "notification-worker", "frontend")
foreach ($processName in $processNames) { Stop-LocalProcess $processName }

$managedProcesses = @()
$managedProcesses += Start-ForegroundProcess "backend" $PythonExe @(
    "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"
) $BackendRoot
$managedProcesses += Start-ForegroundProcess "document-worker" $PythonExe @("-m", "app.workers.documents") $BackendRoot
$managedProcesses += Start-ForegroundProcess "notification-worker" $PythonExe @("-m", "app.workers.notifications") $BackendRoot
$npmExe = (Get-Command npm.cmd).Source
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:8001"
$managedProcesses += Start-ForegroundProcess "frontend" $npmExe @("run", "dev", "--", "--host", "127.0.0.1") $FrontendRoot

Write-Host "[6/6] Cho he thong san sang..."
try {
    Wait-Url "Backend" "http://127.0.0.1:8001/health/ready"
    Wait-Url "Frontend" "http://127.0.0.1:5173"
} catch {
    Write-Host ""
    Write-Host "Khoi dong that bai. Xem log ngay trong cua so nay."
    throw
}

Write-Host ""
Write-Host "He thong da san sang (che do khong Docker)."
Write-Host "Website: http://127.0.0.1:5173"
Write-Host "API docs: http://127.0.0.1:8001/docs"
Write-Host "Du lieu test: MongoDB Atlas / ai_sales_assistant_local"
Write-Host "Log dang hien truc tiep trong cua so run.bat."
Write-Host "Production van chay rieng tai https://seminar.bkpvp.top"
Start-Process "http://127.0.0.1:5173"
Write-Host ""
Write-Host "GIU CUA SO NAY MO DE WEBSITE HOAT DONG. Nhan Ctrl+C de dung."

try {
    while ($true) {
        foreach ($entry in $managedProcesses) {
            $entry.Process.Refresh()
            if ($entry.Process.HasExited) {
                throw "$($entry.Name) da dung bat ngo (exit code $($entry.Process.ExitCode))."
            }
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host ""
    Write-Host "Dang dung cac dich vu local..."
    foreach ($processName in $processNames) { Stop-LocalProcess $processName }
    Write-Host "Da dung toan bo dich vu local."
}
