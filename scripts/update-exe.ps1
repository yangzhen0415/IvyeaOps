# IvyeaOps Windows x64 one-click updater.
#
# Safe update for GitHub Release ZIP installs:
#   1. stop the background server
#   2. download the latest IvyeaOps-Windows-x64.zip
#   3. copy new program files over the current folder
#   4. keep user data/config: data\, logs\, server\.env
#   5. rerun install-exe.ps1 so shortcuts are refreshed and the app restarts

param(
    [string]$DownloadUrl = "https://github.com/Hector-xue/IvyeaOps/releases/latest/download/IvyeaOps-Windows-x64.zip"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Write-Info($msg) { Write-Host "[IvyeaOps] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[IvyeaOps] 注意: $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[IvyeaOps] 错误: $msg" -ForegroundColor Red; Read-Host "按回车退出"; exit 1 }

function Stop-IvyeaOps {
    $StopScript = Join-Path $RepoRoot "scripts\stop-hidden.ps1"
    if (Test-Path $StopScript) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $StopScript
        return
    }
    try {
        $conn = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
    } catch {}
}

function Find-PackageRoot($ExtractDir) {
    $directExe = Join-Path $ExtractDir "IvyeaOpsServer.exe"
    if (Test-Path $directExe) { return $ExtractDir }

    $dirs = Get-ChildItem $ExtractDir -Directory
    foreach ($d in $dirs) {
        if (Test-Path (Join-Path $d.FullName "IvyeaOpsServer.exe")) { return $d.FullName }
    }
    return $null
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  IvyeaOps Windows x64 一键更新" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  会保留：data\、logs\、server\.env"
Write-Host "  会更新：程序文件、前端页面、脚本、文档"
Write-Host ""

$EnvFile = Join-Path $RepoRoot "server\.env"
$DataDir = Join-Path $RepoRoot "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

$TempRoot = Join-Path $env:TEMP ("IvyeaOpsUpdate-" + [Guid]::NewGuid().ToString("N"))
$ZipPath = Join-Path $TempRoot "IvyeaOps-Windows-x64.zip"
$ExtractDir = Join-Path $TempRoot "extract"
$EnvBackup = Join-Path $TempRoot "server.env.backup"

try {
    New-Item -ItemType Directory -Force -Path $TempRoot, $ExtractDir | Out-Null
    if (Test-Path $EnvFile) { Copy-Item $EnvFile $EnvBackup -Force }

    Write-Info "停止后台服务..."
    Stop-IvyeaOps

    Write-Info "下载最新版 Windows x64 包..."
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing

    Write-Info "解压更新包..."
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
    $PackageRoot = Find-PackageRoot $ExtractDir
    if (-not $PackageRoot) { Write-Fail "更新包不完整：未找到 IvyeaOpsServer.exe。" }

    Write-Info "覆盖程序文件（保留数据和配置）..."
    $robocopyArgs = @(
        $PackageRoot,
        $RepoRoot,
        "/E",
        "/XD", "data", "logs", ".git",
        "/XF", ".env",
        "/R:2",
        "/W:1",
        "/NFL",
        "/NDL",
        "/NP"
    )
    & robocopy @robocopyArgs | Out-Host
    $rc = $LASTEXITCODE
    if ($rc -gt 7) { Write-Fail "文件复制失败，robocopy exit code: $rc" }

    if ((Test-Path $EnvBackup) -and -not (Test-Path $EnvFile)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EnvFile) | Out-Null
        Copy-Item $EnvBackup $EnvFile -Force
    }

    $InstallScript = Join-Path $RepoRoot "scripts\install-exe.ps1"
    if (-not (Test-Path $InstallScript)) { Write-Fail "更新后未找到 scripts\install-exe.ps1。" }

    Write-Info "刷新快捷方式并重启 IvyeaOps..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $InstallScript

    Write-Host ""
    Write-Info "更新完成。你的数据和配置已保留。"
} catch {
    Write-Fail $_
} finally {
    try { Remove-Item -Recurse -Force $TempRoot -ErrorAction SilentlyContinue } catch {}
}
