$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $ProjectRoot ".runtime\backups"
$PythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
$BackendRoot = Join-Path $ProjectRoot "backend"
$BackupScript = Join-Path $ProjectRoot "deployment\backup-mysql.py"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $BackupRoot "mysql-$stamp.zip"
$uploadsDestination = Join-Path $BackupRoot "uploads-$stamp.zip"
Push-Location $BackendRoot
try {
    & $PythonExe $BackupScript $destination
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $destination)) {
    throw "MySQL backup failed."
}

Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Out-File "$destination.sha256"
if (Get-ChildItem -LiteralPath (Join-Path $BackendRoot "storage\uploads") -ErrorAction SilentlyContinue) {
    Compress-Archive -Path (Join-Path $BackendRoot "storage\uploads\*") `
        -DestinationPath $uploadsDestination -CompressionLevel Optimal
    Get-FileHash -LiteralPath $uploadsDestination -Algorithm SHA256 | `
        Out-File "$uploadsDestination.sha256"
}
# Khong tu xoa backup cu khi chuyen database; nguoi quan tri tu ap dung chinh sach luu tru.
