@echo off
REM Setup BuildIQ Health — npm install (no admin, constrained PowerShell safe)
cd /d "%~dp0"
call "%~dp0buildiq-npm.cmd" install
if errorlevel 1 pause
