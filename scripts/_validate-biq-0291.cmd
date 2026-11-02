@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=%TEMP%\biq-0291-validate.txt
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
echo START>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-finish-debounced-edits.ts >>"%OUT%" 2>&1
echo DEBOUNCE:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-logger-performance.ts >>"%OUT%" 2>&1
echo LOGGER:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-finish-workout.ts >>"%OUT%" 2>&1
echo FINISH:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-set-log-network-retry.ts >>"%OUT%" 2>&1
echo RETRY:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >>"%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>>"%OUT%"
echo END>>"%OUT%"
