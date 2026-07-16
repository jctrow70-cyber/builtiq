@echo off
REM Import all exercise datasets (guided library + alternatives)
cd /d "%~dp0"
call "%~dp0buildiq-import-guided.cmd"
if errorlevel 1 exit /b 1
echo.
echo Importing exercise alternatives...
call "%~dp0buildiq-npm.cmd" run import:alternatives
pause
