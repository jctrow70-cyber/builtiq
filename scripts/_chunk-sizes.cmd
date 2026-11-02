@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=%TEMP%\biq-chunk-sizes.txt
echo CHUNKS> "%OUT%"
dir /-c ".next\static\chunks\webpack.js" ".next\static\chunks\main-app.js" ".next\static\chunks\app-pages-internals.js" ".next\static\chunks\polyfills.js" ".next\static\chunks\app\page.js" ".next\static\chunks\app\layout.js" >> "%OUT%" 2>&1
echo CSS>> "%OUT%"
dir /s /-c ".next\static\css\app\layout.css" >> "%OUT%" 2>&1
echo PAGEJS>> "%OUT%"
powershell -NoProfile -Command "$p='.next\static\chunks\app\page.js'; if(Test-Path $p){(Get-Item $p).Length}" >> "%OUT%" 2>&1
