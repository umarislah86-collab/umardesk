@echo off
cd /d "%~dp0"
echo ==============================
echo    Ticket Tracker - Starting
echo ==============================
echo.

echo Clearing old processes...
taskkill /IM python.exe /F >nul 2>&1
taskkill /IM python3.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo Starting clipboard helper...
start "Clipboard Helper" python "%~dp0clipboard_helper.py"
timeout /t 2 /nobreak >nul

echo Opening browser...
start http://localhost:9090
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C or close to stop.
echo.
python -m http.server 9090
