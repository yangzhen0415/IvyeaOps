@echo off
chcp 65001 >/dev/null
title IvyeaOps
cd /d "%~dp0server"
if not exist ".venv\Scripts\python.exe" (
  echo [错误] 还没安装。请先双击根目录的「安装 IvyeaOps.bat」完成安装。
  pause
  exit /b 1
)
echo ============================================
echo   IvyeaOps 启动中... 浏览器稍后自动打开
echo   http://127.0.0.1:8001
echo   ★ 这个窗口就是服务本身；关闭它即停止服务
echo ============================================
echo.
rem 后台等几秒再开浏览器；主进程在本窗口前台跑，报错才看得见
start "" /b powershell -NoProfile -Command "Start-Sleep 6; Start-Process 'http://127.0.0.1:8001'"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
echo.
echo ============================================
echo   [服务已停止] 若上方有报错，请截图发给作者排查。
echo ============================================
pause
