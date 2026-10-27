$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DockerEnvPath = Join-Path $ProjectRoot ".env.docker"

if (Test-Path -LiteralPath $DockerEnvPath) {
    Write-Host "Da co .env.docker; giu nguyen cau hinh va mat khau."
    return
}

$BackendEnvPath = Join-Path $ProjectRoot "backend\.env"
$TemplatePath = Join-Path $ProjectRoot ".env.docker.example"
$SourcePath = if (Test-Path -LiteralPath $BackendEnvPath) { $BackendEnvPath } else { $TemplatePath }
$SourceLines = [IO.File]::ReadAllLines($SourcePath)
$DockerSettings = [ordered]@{
    COMPOSE_PROJECT_NAME = "trolyviet"
    DOCKER_ENV_FILE = ".env.docker"
    DOCKER_WEB_PORT = "8080"
    MYSQL_DATABASE = "ccnlthd"
    MYSQL_USER = "ccnlthd_app"
    MYSQL_PASSWORD = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    MYSQL_ROOT_PASSWORD = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    APP_ENV = "development"
    APP_SECRET_KEY = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    APP_PUBLIC_URL = "http://127.0.0.1:8080"
    FRONTEND_ORIGIN = "http://127.0.0.1:8080"
    APP_DOMAIN = "localhost"
    DATABASE_BACKEND = "sql"
    RATE_LIMIT_BACKEND = "sql"
    UPLOAD_DIR = "/data/uploads"
}

# Giữ khóa tích hợp hiện có nhưng không mang kết nối DB local/MongoDB vào Docker.
$ExcludedKeys = @($DockerSettings.Keys) + @("DATABASE_URL", "MONGODB_URI", "MONGODB_DATABASE")
$KeptLines = @($SourceLines | Where-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
        return $Matches[1] -notin $ExcludedKeys
    }
    return $true
})
$GeneratedLines = @($DockerSettings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
[IO.File]::WriteAllLines($DockerEnvPath, @($KeptLines + "" + $GeneratedLines), [Text.UTF8Encoding]::new($false))
Write-Host "Da tao .env.docker voi mat khau rieng; backend/.env khong bi thay doi."
Write-Host "Database Docker bat dau rieng, khong tu nhap du lieu MySQL local."
