@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
"%NODE%" "%TEMP%\biq-after-sizes.js" > "%TEMP%\biq-after-sizes.txt" 2>&1
"%NODE%" "%TEMP%\biq-chunk-sizes.js" >> "%TEMP%\biq-after-sizes.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-after-sizes.txt"
