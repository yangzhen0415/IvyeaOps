# ops-hub — Windows quick setup
Write-Host ""
Write-Host "  ops-hub — quick setup" -ForegroundColor Cyan
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Docker is not installed." -ForegroundColor Red
    Write-Host "  Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
}

# Check Docker Compose
try { docker compose version 2>&1 | Out-Null } catch {
    Write-Host "  [ERROR] Docker Compose is not available." -ForegroundColor Red
    Write-Host "  Update Docker Desktop to the latest version."
    exit 1
}

# Create .env if not exists
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    # Generate random password
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $pass = -join (1..12 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    (Get-Content .env) -replace 'CHANGE_ME_123', $pass | Set-Content .env
    Write-Host "  Created .env with random password: $pass" -ForegroundColor Green
    Write-Host "  Save this password!"
    Write-Host ""
}

# Build and start
Write-Host "  Building Docker image..."
docker compose build

Write-Host "  Starting services..."
docker compose up -d

$port = if ($env:PORT) { $env:PORT } else { "8080" }
Write-Host ""
Write-Host "  =====================================" -ForegroundColor Green
Write-Host "  ops-hub is running!" -ForegroundColor Green
Write-Host "  Open: http://localhost:$port" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor Green
Write-Host ""
