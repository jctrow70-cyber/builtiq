@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" node_modules\tsx\dist\cli.mjs lib\scienceEngine\acceptanceCheck.ts > docs\catalog-overhaul\science-2b1-output.txt 2>&1
echo SCIENCE_EXIT=%ERRORLEVEL%>> docs\catalog-overhaul\science-2b1-output.txt
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" node_modules\tsx\dist\cli.mjs scripts\verify-2b1-env.ts > docs\catalog-overhaul\env-2b1-verify-out.txt 2>&1
echo ENV_EXIT=%ERRORLEVEL%>> docs\catalog-overhaul\env-2b1-verify-out.txt
