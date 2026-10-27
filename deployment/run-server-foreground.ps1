$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$FrontendDist = Join-Path $ProjectRoot "frontend\dist\index.html"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$PythonExe = Join-Path $BackendRoot ".venv\Scripts\python.exe"
$StopScript = Join-Path $PSScriptRoot "stop-server.ps1"
$SupervisorScript = Join-Path $PSScriptRoot "supervise-server.ps1"
$ProcessNames = @("server-backend", "server-document-worker", "server-notification-worker")
$ManagedProcesses = @()

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

function Get-DescendantProcessIds([int]$RootPid) {
    $snapshot = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
    $result = @()
    $parents = @($RootPid)
    while ($parents.Count -gt 0) {
        $children = @($snapshot | Where-Object { $parents -contains [int]$_.ParentProcessId })
        if ($children.Count -eq 0) { break }
        $childIds = @($children | ForEach-Object { [int]$_.ProcessId })
        $result += $childIds
        $parents = $childIds
    }
    return $result
}

function Stop-ProcessTree([int]$RootPid) {
    $descendants = @(Get-DescendantProcessIds $RootPid)
    [array]::Reverse($descendants)
    foreach ($processId in $descendants) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
}

function Stop-LegacySupervisor {
    $expectedPath = [IO.Path]::GetFullPath($SupervisorScript)
    $supervisors = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @("powershell.exe", "pwsh.exe") -and
        $_.CommandLine -and
        $_.CommandLine.IndexOf($expectedPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    foreach ($supervisor in $supervisors) {
        Write-Host "      Dung bo giam sat cu (PID $($supervisor.ProcessId))..."
        Stop-ProcessTree ([int]$supervisor.ProcessId)
    }
}

function Start-ManagedProcess([string]$Name, [string[]]$Arguments) {
    $process = Start-Process -FilePath $PythonExe -ArgumentList $Arguments `
        -WorkingDirectory $BackendRoot -NoNewWindow -PassThru
    Set-Content -LiteralPath (Join-Path $RuntimeRoot "$Name.pid") -Value $process.Id
    Write-Host "      $Name dang chay (PID $($process.Id))."
    return [PSCustomObject]@{ Name = $Name; Process = $process }
}

function Test-BackendReady {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/ready" -TimeoutSec 2
        return $health.status -eq "ready"
    } catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Chua co Python virtual environment: $PythonExe"
}
if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot ".env"))) {
    throw "Thieu cau hinh production backend\.env"
}
if (-not (Test-Path -LiteralPath $FrontendDist)) {
    throw "Chua co ban build frontend. Hay chay deployment\deploy-server.ps1 mot lan."
}

Write-Host "[1/4] Tat co che tu khoi dong cu..."
$startupTask = Get-ScheduledTask -TaskName "AI Sales Assistant Server" -ErrorAction SilentlyContinue
if ($startupTask) {
    if ($startupTask.State -eq "Running") {
        Stop-ScheduledTask -TaskName "AI Sales Assistant Server" -ErrorAction SilentlyContinue
    }
    if ($startupTask.State -ne "Disabled") {
        Disable-ScheduledTask -TaskName "AI Sales Assistant Server" -ErrorAction SilentlyContinue | Out-Null
    }
}

Write-Host "[2/4] Don dep PID va tien trinh cu cua du an..."
& $StopScript
Stop-LegacySupervisor
foreach ($name in $ProcessNames) {
    Remove-Item -LiteralPath (Join-Path $RuntimeRoot "$name.pid") -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath (Join-Path $RuntimeRoot "server.stop") -Force -ErrorAction SilentlyContinue

try {
    Push-Location $BackendRoot
    try {
        & $PythonExe (Join-Path $PSScriptRoot "prepare-mysql.py")
        if ($LASTEXITCODE -ne 0) { throw "MySQL/schema chua san sang; xem database\HUONG_DAN_MYSQL.md." }
        $PublicUrl = (& $PythonExe -c "from app.core.config import get_settings; print(get_settings().app_public_url)").TrimEnd('/')
        if ($LASTEXITCODE -ne 0) { throw "Khong doc duoc backend/.env." }
    } finally {
        Pop-Location
    }
    Write-Host "[3/4] Khoi dong backend va cac worker (log hien tai day)..."
    $ManagedProcesses += Start-ManagedProcess "server-backend" @(
        "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000",
        "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"
    )
    $ManagedProcesses += Start-ManagedProcess "server-document-worker" @(
        "-m", "app.workers.documents"
    )
    $ManagedProcesses += Start-ManagedProcess "server-notification-worker" @(
        "-m", "app.workers.notifications"
    )

    Write-Host "[4/4] Cho server san sang..."
    $ready = $false
    for ($attempt = 1; $attempt -le 40; $attempt++) {
        if (Test-BackendReady) {
            $ready = $true
            break
        }
        foreach ($entry in $ManagedProcesses) {
            $entry.Process.Refresh()
            if ($entry.Process.HasExited) {
                throw "$($entry.Name) dung khi dang khoi dong (exit code $($entry.Process.ExitCode))."
            }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw "Backend khong san sang sau 40 giay." }

    Write-Host ""
    Write-Host "============================================================"
    Write-Host " SERVER DA SAN SANG - GIU CUA SO NAY MO"
    Write-Host "============================================================"
    Write-Host " Trang chu        : $PublicUrl/"
    Write-Host " Dang nhap        : $PublicUrl/login"
    Write-Host " Dashboard User   : $PublicUrl/app"
    Write-Host " Trang Admin      : $PublicUrl/admin"
    Write-Host " Test Widget      : $PublicUrl/widget-test.html"
    Write-Host " Widget Script    : $PublicUrl/widget.js"
    Write-Host " API Docs (local) : http://127.0.0.1:8000/docs"
    Write-Host " Health (local)   : http://127.0.0.1:8000/health/ready"
    Write-Host "============================================================"
    Write-Host " Nhan Ctrl+C hoac dong cua so de dung server."
    Write-Host ""
    Start-Process "$PublicUrl/"

    while ($true) {
        foreach ($entry in $ManagedProcesses) {
            $entry.Process.Refresh()
            if ($entry.Process.HasExited) {
                throw "$($entry.Name) da dung bat ngo (exit code $($entry.Process.ExitCode))."
            }
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host ""
    Write-Host "Dang dung toan bo server..."
    foreach ($entry in $ManagedProcesses) {
        if (-not $entry.Process.HasExited) {
            Stop-ProcessTree $entry.Process.Id
        }
        Remove-Item -LiteralPath (Join-Path $RuntimeRoot "$($entry.Name).pid") `
            -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Da dung backend va cac worker."
}
