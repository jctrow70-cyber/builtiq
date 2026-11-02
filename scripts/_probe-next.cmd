@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=%TEMP%\biq-next-diag.txt
echo CMDLINE> "%OUT%"
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=37748').CommandLine" >> "%OUT%" 2>&1
echo PARENT>> "%OUT%"
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=37748').ParentProcessId" >> "%OUT%" 2>&1
echo NEXTDIR>> "%OUT%"
dir /b ".next" >> "%OUT%" 2>&1
echo HEADERS>> "%OUT%"
curl -sI --max-time 10 http://127.0.0.1:3000/ >> "%OUT%" 2>&1
echo API>> "%OUT%"
curl -s -D - -o NUL --max-time 10 http://127.0.0.1:3000/api/health >> "%OUT%" 2>&1
