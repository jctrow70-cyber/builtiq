@echo off
echo === port ===> "%TEMP%\biq-c-curl3.txt"
netstat -ano | findstr ":3002" >> "%TEMP%\biq-c-curl3.txt"
echo === curl ===>> "%TEMP%\biq-c-curl3.txt"
curl.exe -s -o "%TEMP%\biq-c-home3.html" -w "HTTP:%%{http_code} time:%%{time_total}" http://127.0.0.1:3002/ >> "%TEMP%\biq-c-curl3.txt"
echo.>> "%TEMP%\biq-c-curl3.txt"
echo CURL_EXIT:%ERRORLEVEL%>> "%TEMP%\biq-c-curl3.txt"
