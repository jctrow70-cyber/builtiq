@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=%~dp0..\node_modules\tsx\dist\cli.mjs
set OUT=%~dp0tmp-biq0271-tests-out.txt
cd /d "%~dp0.."
> "%OUT%" echo cwd=%CD%
echo === test-workout-preview === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-workout-preview.ts" >> "%OUT%" 2>&1
echo PREVIEW_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === test-customize-for-me === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-customize-for-me.ts" >> "%OUT%" 2>&1
echo CUSTOMIZE_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === test-group-strength-workout === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-group-strength-workout.ts" >> "%OUT%" 2>&1
echo GROUP_STRENGTH_EXIT=%ERRORLEVEL% >> "%OUT%"
