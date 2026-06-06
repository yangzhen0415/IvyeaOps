@echo off
chcp 65001 >nul
title IvyeaOps
cd /d "%~dp0server"
if not exist ".venv\Scripts\python.exe" (
  echo [错误] 还没安装。请先双击根目录的「安装 IvyeaOps.bat」完成安装。
  pause
  exit /b 1
)
echo 正在启动 IvyeaOps... 几秒后浏览器会自动打开 http://127.0.0.1:8001
start "" /min ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:8001
echo.
echo IvyeaOps 已在后台运行（最小化的窗口）。关闭那个窗口即可停止服务。
