@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
echo ===LOG=== > docs\catalog-overhaul\_env-history.txt
git log -20 --oneline >> docs\catalog-overhaul\_env-history.txt
echo ===BRANCHES=== >> docs\catalog-overhaul\_env-history.txt
git branch -a >> docs\catalog-overhaul\_env-history.txt
echo ===FILE_HEAD=== >> docs\catalog-overhaul\_env-history.txt
git log -5 --oneline -- lib/training/catalogSearch.ts lib/training/masterCatalog.ts lib/training/exerciseTypes.ts >> docs\catalog-overhaul\_env-history.txt
echo ===SHOW_261=== >> docs\catalog-overhaul\_env-history.txt
git grep -n "Diverging Row" HEAD -- lib/training/masterCatalog.ts >> docs\catalog-overhaul\_env-history.txt
echo ===SHOW_SECTION=== >> docs\catalog-overhaul\_env-history.txt
git grep -n "section?: string" HEAD -- lib/training/catalogSearch.ts >> docs\catalog-overhaul\_env-history.txt
echo ===DIFF_SEARCH=== >> docs\catalog-overhaul\_env-history.txt
git diff --stat -- lib/training/catalogSearch.ts lib/training/masterCatalog.ts lib/training/exerciseTypes.ts lib/training/catalogCleanupCheck.ts >> docs\catalog-overhaul\_env-history.txt
echo ===BLAME_COUNT=== >> docs\catalog-overhaul\_env-history.txt
git show HEAD:lib/training/masterCatalog.ts | findstr /C:"id: '261'" /C:"id: '262'" /C:"id: '263'" /C:"expectedMasterCatalogCount" >> docs\catalog-overhaul\_env-history.txt
