@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=%TEMP%\biq-c-tsc.txt
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-lazy-screens.ts > "%OUT%" 2>&1
echo LAZY:%ERRORLEVEL%>> "%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >> "%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>> "%OUT%"
