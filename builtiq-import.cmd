@echo off
REM Double-click to run exercise import (requires .env.local with service role key)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" -ImportExercises
if errorlevel 1 pause
