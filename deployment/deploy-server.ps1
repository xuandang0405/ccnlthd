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

    $startupTask = Get-ScheduledTask -TaskName "AI Sales Assistant Server" `
        -ErrorAction SilentlyContinue
    if ($startupTask) {
        Stop-ScheduledTask -TaskName "AI Sales Assistant Server" -ErrorAction SilentlyContinue
        Disable-ScheduledTask -TaskName "AI Sales Assistant Server" `
            -ErrorAction SilentlyContinue | Out-Null
    }
    $supervisorPath = [IO.Path]::GetFullPath(
        (Join-Path $PSScriptRoot "supervise-server.ps1")
    )
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @("powershell.exe", "pwsh.exe") -and
        $_.CommandLine -and
        $_.CommandLine.IndexOf($supervisorPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

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

    Write-Host "Deploy hoan tat. Server dang tat; mo run.bat de khoi dong."
} finally {
    Remove-Item -LiteralPath $DeployLock -Force -ErrorAction SilentlyContinue
}
