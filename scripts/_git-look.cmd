@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
git status --short > "%TEMP%\biq-git-status.txt"
git diff --stat > "%TEMP%\biq-git-diff.txt"
git log -5 --oneline > "%TEMP%\biq-git-log.txt"
echo DONE
