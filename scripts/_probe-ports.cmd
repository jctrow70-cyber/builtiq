@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=%TEMP%\biq-ports.txt
echo NETSTAT> "%OUT%"
netstat -ano | findstr ":3000 :3002" >> "%OUT%"
echo CURL3000>> "%OUT%"
curl -s -D - -o "%TEMP%\biq-3000-body.txt" --max-time 15 http://127.0.0.1:3000/ >> "%OUT%" 2>&1
echo BODY3000>> "%OUT%"
type "%TEMP%\biq-3000-body.txt" >> "%OUT%" 2>&1
echo CURL3002>> "%OUT%"
curl -s -D - -o "%TEMP%\biq-3002-body.txt" --max-time 8 http://127.0.0.1:3002/ >> "%OUT%" 2>&1
echo BODY3002>> "%OUT%"
type "%TEMP%\biq-3002-body.txt" >> "%OUT%" 2>&1
echo DONE>> "%OUT%"
