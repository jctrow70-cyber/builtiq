@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set "PATH=C:\Users\JesseTrowbridge\AppData\Local\buildiq-node\node-v22.16.0-win-x64;%PATH%"
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" node_modules\tsx\dist\cli.mjs scripts\verify-catalog-env.ts > docs\catalog-overhaul\env-live-verify-out.txt 2>&1
echo VERIFY_EXIT=%ERRORLEVEL%>> docs\catalog-overhaul\env-live-verify-out.txt
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" node_modules\tsx\dist\cli.mjs lib\scienceEngine\acceptanceCheck.ts > docs\catalog-overhaul\science-test-output.txt 2>&1
echo SCIENCE_EXIT=%ERRORLEVEL%>> docs\catalog-overhaul\science-test-output.txt
