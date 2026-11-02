@echo off
set OUT=%TEMP%\biq-0288-commit.txt
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_commit-biq-0290.cmd 2>nul
git add -- CHANGELOG.md DECISIONS.md ROADMAP.md public/brand/icon-512.png public/brand/apple-icon-180.png app/icon/route.ts app/apple-icon/route.ts app/icon.tsx app/apple-icon.tsx >"%OUT%" 2>&1
git commit -m "BIQ-0288 Serve the app icons as static images." -m "Production export no longer renders the home-screen icons with next/og." >>"%OUT%" 2>&1
echo COMMIT:%ERRORLEVEL%>>"%OUT%"
git log -3 --oneline >>"%OUT%" 2>&1
git status --short >>"%OUT%" 2>&1
