@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false > "%TEMP%\biq-c-tsc2.txt" 2>&1
echo TSC:%ERRORLEVEL%>> "%TEMP%\biq-c-tsc2.txt"
