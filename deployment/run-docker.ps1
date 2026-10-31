param([string]$EnvFile = ".env.docker")

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Khong tim thay Docker. Cai/mo Docker Desktop va dung Linux containers."
    }
    $DockerPlatform = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop chua san sang. Hay mo Docker Desktop." }
    if ($DockerPlatform -ne "linux") { throw "Chuyen Docker Desktop sang Linux containers." }
    if ($EnvFile -eq ".env.docker") { & (Join-Path $PSScriptRoot "setup-docker.ps1") }
    $ComposeArgs = @("compose", "--env-file", $EnvFile, "-f", "docker-compose.yml")
    & docker @ComposeArgs config --quiet
    if ($LASTEXITCODE -ne 0) { throw "Cau hinh Docker khong hop le." }

    $PublicUrlLine = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^APP_PUBLIC_URL=' } | Select-Object -Last 1
    $PublicUrl = ($PublicUrlLine -replace '^APP_PUBLIC_URL=', '').Trim('"', "'").TrimEnd('/')
    Write-Host ""
    Write-Host "CAC URL (su dung khi frontend/backend da healthy):"
    foreach ($Page in @("", "login", "register", "app", "admin", "widget-test.html", "widget.js", "docs", "health/ready")) {
        Write-Host "  $PublicUrl/$Page"
    }
    Write-Host ""
    Write-Host "Log MySQL, migration, backend, workers va frontend se hien tai day."
    Write-Host "Giu cua so mo. Nhan Ctrl+C de dung, khong xoa database/upload."
    $env:COMPOSE_MENU = "false"
    try {
        & docker @ComposeArgs up --build --abort-on-container-failure
        if ($LASTEXITCODE -ne 0) { throw "Docker khoi dong/van hanh bi loi. Xem log phia tren." }
    } finally {
        # Không dùng down -v; dữ liệu giữ nguyên trong named volumes.
        & docker @ComposeArgs stop --timeout 30
    }
} finally {
    Pop-Location
}
