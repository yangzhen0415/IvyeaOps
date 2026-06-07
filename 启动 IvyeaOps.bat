@echo off
title IvyeaOps
cd /d "%~dp0server"
if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Not installed yet. Run the installer first ^(double-click the install .bat^).
  pause
  exit /b 1
)
echo ============================================
echo   Starting IvyeaOps ...
echo   Browser will open: http://127.0.0.1:8001
echo   Keep this window open = server running. Close it = stop.
echo ============================================
echo.
start "" /b powershell -NoProfile -Command "Start-Sleep 6; Start-Process 'http://127.0.0.1:8001'"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
echo.
echo [Server stopped] If there is an error above, please screenshot/copy it.
pause
