@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
echo === listeners ===> "%TEMP%\biq-c-bundle.txt"
netstat -ano | findstr ":3002" >> "%TEMP%\biq-c-bundle.txt"
echo === curl ===>> "%TEMP%\biq-c-bundle.txt"
curl -s -o "%TEMP%\biq-c-home.html" -w "HTTP:%%{http_code} time:%%{time_total}\n" http://127.0.0.1:3002/ >> "%TEMP%\biq-c-bundle.txt" 2>&1
echo === sizes ===>> "%TEMP%\biq-c-bundle.txt"
"%NODE%" "%TEMP%\biq-chunk-sizes.js" >> "%TEMP%\biq-c-bundle.txt" 2>&1
echo EXIT:%ERRORLEVEL%>> "%TEMP%\biq-c-bundle.txt"
