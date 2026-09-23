$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $ProjectRoot ".runtime\backups"
$PythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
$BackendRoot = Join-Path $ProjectRoot "backend"
$BackupScript = Join-Path $ProjectRoot "deployment\backup-mongodb.py"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $BackupRoot "mongodb-$stamp.zip"
$uploadsDestination = Join-Path $BackupRoot "uploads-$stamp.zip"
Push-Location $BackendRoot
try {
    & $PythonExe $BackupScript $destination
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $destination)) {
    throw "MongoDB backup failed."
}

Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Out-File "$destination.sha256"
Compress-Archive -Path (Join-Path $BackendRoot "storage\uploads\*") `
    -DestinationPath $uploadsDestination -CompressionLevel Optimal -Force
Get-FileHash -LiteralPath $uploadsDestination -Algorithm SHA256 | `
    Out-File "$uploadsDestination.sha256"
Get-ChildItem -LiteralPath $BackupRoot -Filter "mongodb-*.zip*" | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-14)
} | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}
Get-ChildItem -LiteralPath $BackupRoot -Filter "uploads-*.zip*" | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-14)
} | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}
