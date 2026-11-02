@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
git status --short > "%TEMP%\biq-status.txt"
git log -5 --oneline >> "%TEMP%\biq-status.txt"
