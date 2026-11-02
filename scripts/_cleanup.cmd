@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_probe-ports.cmd scripts\_probe-pid.cmd scripts\_probe-next.cmd scripts\_probe-parent.cmd scripts\_curl-3002.cmd scripts\_chunk-sizes.cmd scripts\_src-sizes.cmd scripts\_markers.cmd scripts\_snip.cmd scripts\_start-next-3002.cmd
echo LEFT>> "%TEMP%\biq-cleanup.txt"
dir /b scripts\_*.cmd >> "%TEMP%\biq-cleanup.txt" 2>&1
