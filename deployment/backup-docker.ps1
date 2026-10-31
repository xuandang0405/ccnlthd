param([string]$Destination, [string]$EnvFile = ".env.docker")

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path $ProjectRoot ".runtime\backups\docker" }
$BackupRoot = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ComposeArgs = @("compose", "--env-file", $EnvFile, "-f", "docker-compose.yml")

Push-Location $ProjectRoot
try {
    $MySQLContainer = & docker @ComposeArgs ps -q mysql
    $BackendContainer = & docker @ComposeArgs ps -q backend
    if (-not $MySQLContainer -or -not $BackendContainer) {
        throw "MySQL va backend Docker phai dang chay de backup."
    }
    $DatabaseFile = Join-Path $BackupRoot "mysql-$Stamp.sql"
    $UploadsFile = Join-Path $BackupRoot "uploads-$Stamp.tar.gz"
    if ((Test-Path -LiteralPath $DatabaseFile) -or (Test-Path -LiteralPath $UploadsFile)) {
        throw "Ten backup da ton tai; chay lai sau mot giay, khong ghi de."
    }

    # Password lấy trong container, không đưa vào argument -p hay log của host.
    $DumpCommand = 'umask 077; MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u "$MYSQL_USER" --single-transaction --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE" > /tmp/trolyviet-backup.sql'
    & docker @ComposeArgs exec -T mysql sh -c $DumpCommand
    if ($LASTEXITCODE -ne 0) { throw "MySQL dump that bai." }
    & docker cp "${MySQLContainer}:/tmp/trolyviet-backup.sql" $DatabaseFile
    if ($LASTEXITCODE -ne 0) { throw "Khong copy duoc MySQL backup." }
    & docker @ComposeArgs exec -T backend tar -czf /tmp/trolyviet-uploads.tar.gz -C /data/uploads .
    if ($LASTEXITCODE -ne 0) { throw "Upload backup that bai." }
    & docker cp "${BackendContainer}:/tmp/trolyviet-uploads.tar.gz" $UploadsFile
    if ($LASTEXITCODE -ne 0) { throw "Khong copy duoc upload backup." }
    Get-FileHash -LiteralPath $DatabaseFile, $UploadsFile -Algorithm SHA256
    Write-Host "Da backup tai $BackupRoot. Giu mot ban ngoai may chu."
} finally {
    Pop-Location
}
