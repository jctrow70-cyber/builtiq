@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=scripts\_validate-out.txt
echo RETEST>"%OUT%"
"%NODE%" node_modules\tsx\dist\cli.mjs scripts\test-exercise-list-edit.ts >>"%OUT%" 2>&1
echo STATUS_EDIT:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >>"%OUT%" 2>&1
echo TSC:%ERRORLEVEL%>>"%OUT%"
"%NODE%" node_modules\next\dist\bin\next build >>"%OUT%" 2>&1
echo BUILD_STATUS:%ERRORLEVEL%>>"%OUT%"
echo DONE>>"%OUT%"
