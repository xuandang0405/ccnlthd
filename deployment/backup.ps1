param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
)

$ErrorActionPreference = "Stop"
$target = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $target -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$postgresContainer = docker compose ps -q postgres
$backendContainer = docker compose ps -q backend
if (-not $postgresContainer -or -not $backendContainer) {
    throw "PostgreSQL và backend phải đang chạy."
}

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/backup.dump'
docker cp "${postgresContainer}:/tmp/backup.dump" (Join-Path $target "database-$stamp.dump")
docker compose exec -T postgres rm -f /tmp/backup.dump

docker compose exec -T backend tar -czf /tmp/uploads.tar.gz -C /data/uploads .
docker cp "${backendContainer}:/tmp/uploads.tar.gz" (Join-Path $target "uploads-$stamp.tar.gz")
docker compose exec -T backend rm -f /tmp/uploads.tar.gz

Get-FileHash (Join-Path $target "database-$stamp.dump") -Algorithm SHA256
Get-FileHash (Join-Path $target "uploads-$stamp.tar.gz") -Algorithm SHA256
Write-Host "Backup hoàn tất tại $target. Hãy sao chép sang thiết bị/vị trí ngoài máy chủ."
