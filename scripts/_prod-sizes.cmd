@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
"%NODE%" "%TEMP%\biq-prod-sizes.js" > "%TEMP%\biq-prod-sizes.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-prod-sizes.txt"
