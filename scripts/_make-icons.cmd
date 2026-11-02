@echo off
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" "C:\Users\JesseTrowbridge\AppData\Local\Temp\biq-make-icons.js" > "%TEMP%\biq-make-icons.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-make-icons.txt"
