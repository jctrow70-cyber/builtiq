@echo off
REM Install Node.js to your user folder — NO admin rights required
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node-portable.ps1"
if errorlevel 1 pause
