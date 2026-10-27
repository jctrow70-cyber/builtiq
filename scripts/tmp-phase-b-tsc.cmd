@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSC=%~dp0..\node_modules\typescript\bin\tsc
set OUT=%~dp0tmp-phase-b-tsc-out.txt
cd /d "%~dp0.."
"%NODE_HELPER%" "%TSC%" --noEmit --pretty false > "%OUT%" 2>&1
echo TSC_EXIT=%ERRORLEVEL% >> "%OUT%"
