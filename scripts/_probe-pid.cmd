@echo off
set OUT=%TEMP%\biq-pid-3000.txt
echo TASK>> "%OUT%"
tasklist /FI "PID eq 37748" /V >> "%OUT%" 2>&1
echo WMIC>> "%OUT%"
wmic process where "ProcessId=37748" get ProcessId,Name,ExecutablePath,CommandLine /FORMAT:LIST >> "%OUT%" 2>&1
echo PARENT>> "%OUT%"
wmic process where "ProcessId=37748" get ParentProcessId /VALUE >> "%OUT%" 2>&1
