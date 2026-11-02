@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
"%NODE%" "%TEMP%\biq-find-bench.js" > "%TEMP%\biq-find-bench.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-find-bench.txt"
