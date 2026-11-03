@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [MarbleGame] Node.js was not found. Install Node.js 20 or later.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [MarbleGame] npm was not found. Reinstall Node.js.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [MarbleGame] Installing dependencies for the first run...
  call npm ci
  if errorlevel 1 goto :failed
)

set "OPEN_PATH=/"
if /I "%~1"=="debug" set "OPEN_PATH=/?debug"

echo.
echo [MarbleGame] Starting game. The browser will open automatically.
echo [MarbleGame] Press Ctrl+C in this window to stop the server.
echo.
call npm run dev -- --open "%OPEN_PATH%"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo [MarbleGame] Startup failed. See the errors above.
pause
exit /b 1
