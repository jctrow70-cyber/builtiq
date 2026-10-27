@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=%~dp0..\node_modules\tsx\dist\cli.mjs
set TSC=%~dp0..\node_modules\typescript\bin\tsc
set OUT=%~dp0tmp-biq0271-verify-out.txt
cd /d "%~dp0.."
> "%OUT%" echo cwd=%CD%
git branch --show-current >> "%OUT%" 2>&1
echo === test-workout-preview === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-workout-preview.ts" >> "%OUT%" 2>&1
echo PREVIEW_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === test-customize-for-me === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-customize-for-me.ts" >> "%OUT%" 2>&1
echo CUSTOMIZE_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === tsc === >> "%OUT%"
"%NODE_HELPER%" "%TSC%" --noEmit >> "%OUT%" 2>&1
echo TSC_EXIT=%ERRORLEVEL% >> "%OUT%"
