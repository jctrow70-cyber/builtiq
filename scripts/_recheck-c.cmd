@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-nutrition-dashboard.ts > "%TEMP%\biq-c-nutrition.txt" 2>&1
echo NUTRITION:%ERRORLEVEL%>> "%TEMP%\biq-c-nutrition.txt"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-lazy-screens.ts >> "%TEMP%\biq-c-nutrition.txt" 2>&1
echo LAZY:%ERRORLEVEL%>> "%TEMP%\biq-c-nutrition.txt"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >> "%TEMP%\biq-c-nutrition.txt" 2>&1
echo TSC:%ERRORLEVEL%>> "%TEMP%\biq-c-nutrition.txt"
