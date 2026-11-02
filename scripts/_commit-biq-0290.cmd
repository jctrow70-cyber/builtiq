@echo off
set OUT=%TEMP%\biq-0290-commit.txt
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_validate-biq-0290.cmd 2>nul
git add -- app/page.tsx lib/training/setLogIntent.ts lib/performance/loggerTiming.ts scripts/test-logger-performance.ts CHANGELOG.md DECISIONS.md ROADMAP.md >"%OUT%" 2>&1
git commit -m "BIQ-0290 Stop finish while a required set is unsaved." -m "Finish no longer stores a session while a required set write is still pending or failed." >>"%OUT%" 2>&1
echo COMMIT:%ERRORLEVEL%>>"%OUT%"
git log -1 --oneline >>"%OUT%" 2>&1
git status --short >>"%OUT%" 2>&1
