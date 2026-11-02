@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=node_modules\tsx\dist\cli.mjs
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
if exist lib\performance\lazyScreen.tsx del /q lib\performance\lazyScreen.tsx
if exist scripts\_splice-catalog.cmd del /q scripts\_splice-catalog.cmd
if exist scripts\_close-programs.cmd del /q scripts\_close-programs.cmd
set OUT=%TEMP%\biq-c-tests.txt
echo. > "%OUT%"
call :run test-lazy-screens
call :run test-screen-session
call :run test-nav-program-load
call :run test-nutrition-dashboard
call :run test-dashboard-progress
call :run test-week-adherence
call :run test-today-training
call :run test-training-simplification
call :run test-finish-workout
call :run test-unified-schedule
call :run test-session-feedback-hydrate
call :run test-session-feedback-inline
call :run test-group-training-workspace
echo TSC>> "%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >> "%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>> "%OUT%"
goto :eof
:run
echo ===== %1 =====>> "%OUT%"
"%NODE%" "%TSX%" scripts\%1.ts >> "%OUT%" 2>&1
echo EXIT:%1:%ERRORLEVEL%>> "%OUT%"
goto :eof
