@echo off
REM Setup Build IQ — npm install (no admin, constrained PowerShell safe)
cd /d "%~dp0"
call "%~dp0build-iq-npm.cmd" install
if errorlevel 1 pause
