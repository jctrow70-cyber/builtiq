@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
taskkill /F /T /PID 24436 > "%TEMP%\biq-build-kill.txt" 2>&1
echo KILLED>> "%TEMP%\biq-build-kill.txt"
"%NODE%" node_modules\next\dist\bin\next build > "%TEMP%\biq-next-build.txt" 2>&1
echo BUILD:%ERRORLEVEL%>> "%TEMP%\biq-next-build.txt"
