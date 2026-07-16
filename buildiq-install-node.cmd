@echo off
REM Install Node.js to your user folder — NO admin, Constrained PowerShell safe
cd /d "%~dp0"
call "%~dp0scripts\install-node-portable.cmd"
if errorlevel 1 pause
