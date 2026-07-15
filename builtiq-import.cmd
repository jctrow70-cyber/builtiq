@echo off
REM Import all exercise datasets (guided library + alternatives)
cd /d "%~dp0"
call "%~dp0builtiq-import-guided.cmd"
if errorlevel 1 exit /b 1
echo.
echo Importing exercise alternatives...
call "%~dp0builtiq-npm.cmd" run import:alternatives
pause
