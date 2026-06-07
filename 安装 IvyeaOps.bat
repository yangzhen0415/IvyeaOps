@echo off
chcp 65001 >nul
title IvyeaOps 安装
cd /d "%~dp0"
echo ============================================
echo   IvyeaOps 一键安装
echo ============================================
echo.
echo 首次安装会：检测/自动安装 Python 和 Node、装依赖、构建前端、
echo 生成配置、并在桌面创建快捷方式。需联网，可能几分钟。
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\install.ps1"
echo.
pause
