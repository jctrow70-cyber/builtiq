@echo off
set SRC=C:\Users\JESSET~1\AppData\Local\Temp\cursor\screenshots
set DEST=C:\Users\JesseTrowbridge\.cursor\projects\c-Users-JesseTrowbridge-OneDrive-Tegria-Documents-GitHub-builtiq\agent-tools\biq0271-phase-b-ux
set OUT=%~dp0tmp-copy-after-shots-out.txt
mkdir "%DEST%" 2>nul
> "%OUT%" echo copying
copy /Y "%SRC%\biq0271-after-*.png" "%DEST%\" >> "%OUT%" 2>&1
echo --- dest --- >> "%OUT%"
dir /b "%DEST%" >> "%OUT%" 2>&1
echo DONE >> "%OUT%"
