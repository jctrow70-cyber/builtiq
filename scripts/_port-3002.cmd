@echo off
netstat -ano | findstr ":3002" > "%TEMP%\biq-port-3002.txt"
echo DONE>> "%TEMP%\biq-port-3002.txt"
