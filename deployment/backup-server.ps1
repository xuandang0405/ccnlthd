$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DatabasePath = Join-Path $ProjectRoot "backend\sales_assistant.db"
$BackupRoot = Join-Path $ProjectRoot ".runtime\backups"
$PythonExe = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
if (-not (Test-Path $DatabasePath)) { throw "Database file is missing." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $BackupRoot "sales_assistant-$stamp.db"
$env:AI_SALES_BACKUP_SOURCE = $DatabasePath
$env:AI_SALES_BACKUP_DESTINATION = $destination
$backupCode = @'
import os
import sqlite3

source = sqlite3.connect(os.environ["AI_SALES_BACKUP_SOURCE"], timeout=30)
destination = sqlite3.connect(os.environ["AI_SALES_BACKUP_DESTINATION"])
try:
    source.backup(destination)
finally:
    destination.close()
    source.close()
'@
$backupCode | & $PythonExe -
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $destination)) {
    throw "SQLite backup failed."
}

Get-ChildItem -LiteralPath $BackupRoot -Filter "sales_assistant-*.db" | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-14)
} | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}
