@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=%TEMP%\biq-0292-validate.txt
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
echo START>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-calendar-first.ts >>"%OUT%" 2>&1
echo CAL:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-nav-program-load.ts >>"%OUT%" 2>&1
echo NAV:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-screen-session.ts >>"%OUT%" 2>&1
echo SCREEN:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-today-training.ts >>"%OUT%" 2>&1
echo TODAY:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-unified-schedule.ts >>"%OUT%" 2>&1
echo UNIFIED:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-finish-workout.ts >>"%OUT%" 2>&1
echo FINISH:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >>"%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>>"%OUT%"
echo END>>"%OUT%"
