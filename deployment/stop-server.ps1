param([switch]$ForDeployment)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$PythonExe = Join-Path $BackendRoot ".venv\Scripts\python.exe"
if (-not $ForDeployment) {
    Set-Content -Path (Join-Path $RuntimeRoot "server.stop") -Value $PID
}
$targets = @(
    @{ Name = "backend"; Match = "uvicorn" },
    @{ Name = "document-worker"; Match = "app.workers.documents" },
    @{ Name = "notification-worker"; Match = "app.workers.notifications" },
    @{ Name = "server-backend"; Match = "uvicorn" },
    @{ Name = "server-document-worker"; Match = "app.workers.documents" },
    @{ Name = "server-notification-worker"; Match = "app.workers.notifications" }
)

foreach ($target in $targets) {
    $pidPath = Join-Path $RuntimeRoot "$($target.Name).pid"
    if (-not (Test-Path $pidPath)) { continue }
    $savedPid = [int](Get-Content $pidPath -ErrorAction SilentlyContinue)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid"
    if ($process -and $process.ExecutablePath -eq $PythonExe `
        -and $process.CommandLine -like "*$($target.Match)*") {
        Stop-Process -Id $savedPid -Force
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

$frontendPidPath = Join-Path $RuntimeRoot "frontend.pid"
if (Test-Path $frontendPidPath) {
    $frontendPid = [int](Get-Content $frontendPidPath -ErrorAction SilentlyContinue)
    $snapshot = Get-CimInstance Win32_Process
    $frontendRoot = $snapshot | Where-Object { $_.ProcessId -eq $frontendPid }
    if ($frontendRoot -and $frontendRoot.Name -eq "cmd.exe" `
        -and $frontendRoot.CommandLine -like "*npm.cmd*run dev*") {
        $descendants = @()
        $parents = @($frontendPid)
        while ($parents.Count -gt 0) {
            $children = @($snapshot | Where-Object { $_.ParentProcessId -in $parents })
            if ($children.Count -eq 0) { break }
            $descendants += $children
            $parents = @($children.ProcessId)
        }
        foreach ($process in @($descendants | Sort-Object ProcessId -Descending)) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $frontendPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $frontendPidPath -Force -ErrorAction SilentlyContinue
}
