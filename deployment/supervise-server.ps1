$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$RunScript = Join-Path $PSScriptRoot "run-server.ps1"
$DeployLock = Join-Path $RuntimeRoot "deploy.lock"
$StopMarker = Join-Path $RuntimeRoot "server.stop"
$SupervisorLog = Join-Path $RuntimeRoot "supervisor.log"

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
Add-Content -Path $SupervisorLog -Value "$(Get-Date -Format o) supervisor started"

while ($true) {
    if (-not (Test-Path $DeployLock) -and -not (Test-Path $StopMarker)) {
        try {
            & $RunScript
        } catch {
            Add-Content -Path $SupervisorLog -Value (
                "$(Get-Date -Format o) restart failed: $($_.Exception.Message)"
            )
        }
    }
    Start-Sleep -Seconds 15
}
