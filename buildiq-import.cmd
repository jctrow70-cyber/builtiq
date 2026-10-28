@echo off
REM Exercise alternatives import. ExerciseDB guided import stays disabled.
cd /d "%~dp0"
echo.
echo ExerciseDB guided import is disabled until commercial rights are verified.
echo Skipping that step. Existing catalog rows are unchanged.
echo.
echo Importing exercise alternatives...
call "%~dp0buildiq-npm.cmd" run import:alternatives
pause
