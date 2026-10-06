@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
echo ===DEVELOP=== > docs\catalog-overhaul\_deploy-check.txt
git rev-parse origin/Develop >> docs\catalog-overhaul\_deploy-check.txt
git log origin/Develop -1 --format=%%h%%s%%n%%ci >> docs\catalog-overhaul\_deploy-check.txt
echo ===MAIN_HAS_ROW=== >> docs\catalog-overhaul\_deploy-check.txt
git grep -n "section:addExercisePanel.section" HEAD -- app/page.tsx >> docs\catalog-overhaul\_deploy-check.txt
git grep -n "section: panel.section" HEAD -- app/components/training/AddExercisePanel.tsx >> docs\catalog-overhaul\_deploy-check.txt
echo ===HEAD_PAGE_DIFF=== >> docs\catalog-overhaul\_deploy-check.txt
git diff --stat HEAD -- app/page.tsx app/components/training/AddExercisePanel.tsx app/components/training/WorkoutTemplateEditor.tsx >> docs\catalog-overhaul\_deploy-check.txt
echo ===GH=== >> docs\catalog-overhaul\_deploy-check.txt
gh api repos/jctrow70-cyber/builtiq/commits/main --jq "{sha:.sha,msg:.commit.message,date:.commit.author.date}" >> docs\catalog-overhaul\_deploy-check.txt 2>> docs\catalog-overhaul\_deploy-check.txt
gh api repos/jctrow70-cyber/builtiq/commits/Develop --jq "{sha:.sha,msg:.commit.message,date:.commit.author.date}" >> docs\catalog-overhaul\_deploy-check.txt 2>> docs\catalog-overhaul\_deploy-check.txt
echo ===DEPLOYMENTS=== >> docs\catalog-overhaul\_deploy-check.txt
gh api repos/jctrow70-cyber/builtiq/deployments?per_page=8 --jq ".[] | {env:.environment,sha:.sha,created:.created_at,desc:.description}" >> docs\catalog-overhaul\_deploy-check.txt 2>> docs\catalog-overhaul\_deploy-check.txt
