param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseBackup,
    [Parameter(Mandatory = $true)]
    [string]$UploadsBackup,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore sẽ ghi đè dữ liệu. Chạy lại với -ConfirmRestore." }
$databaseFile = (Resolve-Path -LiteralPath $DatabaseBackup).Path
$uploadsFile = (Resolve-Path -LiteralPath $UploadsBackup).Path
$postgresContainer = docker compose ps -q postgres
$backendContainer = docker compose ps -q backend
if (-not $postgresContainer -or -not $backendContainer) {
    throw "PostgreSQL và backend phải đang chạy."
}

docker cp $databaseFile "${postgresContainer}:/tmp/restore.dump"
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner /tmp/restore.dump'
docker compose exec -T postgres rm -f /tmp/restore.dump

docker cp $uploadsFile "${backendContainer}:/tmp/uploads.tar.gz"
docker compose exec -T backend sh -c 'find /data/uploads -mindepth 1 -delete && tar -xzf /tmp/uploads.tar.gz -C /data/uploads && rm -f /tmp/uploads.tar.gz'
Write-Host "Restore hoàn tất. Chạy health check và kiểm tra dữ liệu nghiệp vụ ngay."
