@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
if exist .next\cache rmdir /s /q .next\cache
start "biq3002" /MIN cmd /c ""%NODE%" node_modules\next\dist\bin\next dev --port 3002 > "%TEMP%\biq-next-3002b.log" 2>&1"
echo STARTED
