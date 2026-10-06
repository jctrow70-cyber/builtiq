@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
gh api repos/jctrow70-cyber/builtiq/commits/main --jq "{sha:.sha,msg:.commit.message}" > docs\catalog-overhaul\_gh-main.json 2> docs\catalog-overhaul\_gh-err.txt
gh api "repos/jctrow70-cyber/builtiq/commits/Develop" --jq "{sha:.sha,msg:.commit.message}" > docs\catalog-overhaul\_gh-develop.json 2>> docs\catalog-overhaul\_gh-err.txt
gh api "repos/jctrow70-cyber/builtiq/deployments?per_page=10" > docs\catalog-overhaul\_gh-deploy.json 2>> docs\catalog-overhaul\_gh-err.txt
