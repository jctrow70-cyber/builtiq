@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=%TEMP%\biq-next-parent.txt
echo PARENTCMD>> "%OUT%"
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=26812').CommandLine" >> "%OUT%" 2>&1
echo PARENTNAME>> "%OUT%"
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=26812').Name" >> "%OUT%" 2>&1
echo GRAND>> "%OUT%"
powershell -NoProfile -Command "$p=(Get-CimInstance Win32_Process -Filter 'ProcessId=26812').ParentProcessId; $g=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p); $g.ProcessId; $g.Name; $g.CommandLine" >> "%OUT%" 2>&1
echo TRACE>> "%OUT%"
powershell -NoProfile -Command "Get-Content -Tail 30 '.next\trace'" >> "%OUT%" 2>&1
