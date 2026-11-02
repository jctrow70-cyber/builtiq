@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
copy /Y "C:\Users\JesseTrowbridge\AppData\Local\Temp\biq-docs-full\CHANGELOG.md" "CHANGELOG.md"
copy /Y "C:\Users\JesseTrowbridge\AppData\Local\Temp\biq-docs-full\DECISIONS.md" "DECISIONS.md"
copy /Y "C:\Users\JesseTrowbridge\AppData\Local\Temp\biq-docs-full\ROADMAP.md" "ROADMAP.md"
del "scripts\_commit-biq-0289.cmd"
del "scripts\_restore-docs.cmd"
echo DONE> "%TEMP%\biq-restore-docs.txt"
