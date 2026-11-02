@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=%TEMP%\biq-validate.txt
echo START>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-set-log-status.ts >>"%OUT%" 2>&1
echo STATUS_SET:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-exercise-list-edit.ts >>"%OUT%" 2>&1
echo STATUS_EDIT:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-schedule-hardening.ts >>"%OUT%" 2>&1
echo STATUS_SCHED:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-logger-performance.ts >>"%OUT%" 2>&1
echo STATUS_LOGGER:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-finish-workout.ts >>"%OUT%" 2>&1
echo STATUS_FINISH:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-finish-debounced-edits.ts >>"%OUT%" 2>&1
echo STATUS_DEBOUNCE:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-set-log-network-retry.ts >>"%OUT%" 2>&1
echo STATUS_RETRY:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-calendar-first.ts >>"%OUT%" 2>&1
echo STATUS_CAL:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-nav-program-load.ts >>"%OUT%" 2>&1
echo STATUS_NAV:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-screen-session.ts >>"%OUT%" 2>&1
echo STATUS_SCREEN:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-today-training.ts >>"%OUT%" 2>&1
echo STATUS_TODAY:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-unified-schedule.ts >>"%OUT%" 2>&1
echo STATUS_UNIFIED:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-previous-performance.ts >>"%OUT%" 2>&1
echo STATUS_PREV:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >>"%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>>"%OUT%"
echo DONE>>"%OUT%"
