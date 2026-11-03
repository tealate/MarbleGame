@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required. Install Node.js LTS and try again.
  pause
  exit /b 1
)
node tools\capture.mjs %*
set "capture_exit=%errorlevel%"
echo.
if not "%CAPTURE_NO_PAUSE%"=="1" pause
exit /b %capture_exit%
