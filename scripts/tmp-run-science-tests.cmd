@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=%~dp0..\node_modules\tsx\dist\cli.mjs
set SCRIPT=%~dp0..\lib\scienceEngine\acceptanceCheck.ts
set OUT=%~dp0tmp-science-test-out.txt
"%NODE_HELPER%" "%TSX%" "%SCRIPT%" > "%OUT%" 2>&1
echo EXIT=%ERRORLEVEL%>> "%OUT%"
exit /b %ERRORLEVEL%
