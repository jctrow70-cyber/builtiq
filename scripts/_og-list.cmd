@echo off
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" "C:\Users\JesseTrowbridge\AppData\Local\Temp\biq-og-list.js" > "%TEMP%\biq-og-list.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-og-list.txt"
