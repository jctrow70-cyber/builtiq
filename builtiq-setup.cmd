@echo off
REM Double-click to set up BuiltIQ on Windows (Node PATH + npm install)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" %*
if errorlevel 1 pause
