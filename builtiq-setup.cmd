@echo off
REM Setup BuiltIQ — npm install (no admin, constrained PowerShell safe)
cd /d "%~dp0"
call "%~dp0builtiq-npm.cmd" install
if errorlevel 1 pause
