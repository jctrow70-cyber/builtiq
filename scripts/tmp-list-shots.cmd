@echo off
set OUT=%~dp0tmp-list-shots-out.txt
> "%OUT%" echo === TEMP ===
dir /b "C:\Users\JESSET~1\AppData\Local\Temp\cursor\screenshots\biq0271*.png" >> "%OUT%" 2>&1
echo === AFTER === >> "%OUT%"
dir /b "C:\Users\JesseTrowbridge\.cursor\projects\c-Users-JesseTrowbridge-OneDrive-Tegria-Documents-GitHub-builtiq\agent-tools\biq0271-phase-b-ux" >> "%OUT%" 2>&1
echo === BEFORE === >> "%OUT%"
dir /b "C:\Users\JesseTrowbridge\.cursor\projects\c-Users-JesseTrowbridge-OneDrive-Tegria-Documents-GitHub-builtiq\agent-tools\biq0271-phase-b-visual" >> "%OUT%" 2>&1
echo DONE >> "%OUT%"
