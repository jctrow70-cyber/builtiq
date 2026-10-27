@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=%~dp0..\node_modules\tsx\dist\cli.mjs
cd /d "%~dp0.."
"%NODE_HELPER%" "%TSX%" "%~dp0tmp-signin-link.ts"
echo EXIT=%ERRORLEVEL%>> "%~dp0tmp-signin-link-status.txt"
