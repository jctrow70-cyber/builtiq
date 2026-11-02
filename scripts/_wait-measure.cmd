@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set /a n=0
:wait
set /a n+=1
findstr /c:"Ready" "%TEMP%\biq-next-3002b.log" >nul 2>&1
if not errorlevel 1 goto ready
if %n% GEQ 24 goto timeout
timeout /t 5 /nobreak >nul
goto wait
:timeout
echo TIMEOUT>> "%TEMP%\biq-c-bundle2.txt"
goto show
:ready
echo READY after %n%>> "%TEMP%\biq-c-bundle2.txt"
curl -s -o "%TEMP%\biq-c-home2.html" -w "HTTP:%%{http_code} time:%%{time_total}\n" http://127.0.0.1:3002/ > "%TEMP%\biq-c-curl2.txt" 2>&1
:show
echo === log tail ===> "%TEMP%\biq-c-bundle2.txt"
powershell -NoProfile -Command "Get-Content -Path $env:TEMP\biq-next-3002b.log -Tail 30" >> "%TEMP%\biq-c-bundle2.txt"
echo === curl ===>> "%TEMP%\biq-c-bundle2.txt"
type "%TEMP%\biq-c-curl2.txt" >> "%TEMP%\biq-c-bundle2.txt"
echo === sizes ===>> "%TEMP%\biq-c-bundle2.txt"
"%NODE%" "%TEMP%\biq-chunk-sizes.js" >> "%TEMP%\biq-c-bundle2.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-c-bundle2.txt"
