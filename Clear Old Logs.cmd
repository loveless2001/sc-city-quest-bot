@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
rem Old session logs and bench outputs go to the Recycle Bin; add --all to clear
rem every log and the browser caches too. It asks before moving anything.
node tools\clean-logs.mjs %*
pause
