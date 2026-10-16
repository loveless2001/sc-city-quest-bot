@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
if exist "node_modules\playwright\package.json" if exist "node_modules\sharp\package.json" goto ready
echo Installing the bot's dependencies in this folder...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
  pause
  exit /b 1
)
:ready
echo F8 starts or stops the bot when the game window is focused.
echo Escape stops the bot. The game keeps running while the bot is off.
echo Close the game browser window to exit.
node src\interactive-play.mjs %*
if errorlevel 1 pause
