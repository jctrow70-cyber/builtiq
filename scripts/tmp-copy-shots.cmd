@echo off
set SRC=%LOCALAPPDATA%\Temp\cursor\screenshots
set DEST=%USERPROFILE%\.cursor\projects\c-Users-JesseTrowbridge-OneDrive-Tegria-Documents-GitHub-builtiq\agent-tools\biq0271-phase-b-visual
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%\biq0271-*.png" "%DEST%\"
dir /B "%DEST%"
echo DONE
