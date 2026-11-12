@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" scripts\_pack-migrations.js > scripts\_pack-migrations-out.txt 2>&1
echo EXIT %ERRORLEVEL%>> scripts\_pack-migrations-out.txt
