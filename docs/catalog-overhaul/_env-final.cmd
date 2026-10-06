@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=docs\catalog-overhaul\_env-final.txt
echo ===GIT=== > %OUT%
git rev-parse --abbrev-ref HEAD >> %OUT%
git rev-parse HEAD >> %OUT%
git rev-parse origin/main >> %OUT%
git log -1 --format=%%ci%%x09%%s HEAD >> %OUT%
git merge-base --is-ancestor fd96b37 HEAD
echo ancestor_fd96b37=%ERRORLEVEL% >> %OUT%
git merge-base --is-ancestor 67c0cc3 origin/main
echo head_eq_origin_main=%ERRORLEVEL% >> %OUT%
echo origin_Develop= >> %OUT%
git rev-parse origin/Develop >> %OUT%
git log -1 --format=%%ci%%x09%%s origin/Develop >> %OUT%
echo ===LOCALHOST_HEADERS=== >> %OUT%
curl.exe -sI http://localhost:3000/_next/static/chunks/app/page.js >> %OUT% 2>&1
echo ===PROD_HEADERS=== >> %OUT%
curl.exe -sI https://builtiq-duf7.vercel.app/ >> %OUT% 2>&1
echo ===GH_MAIN=== >> %OUT%
gh api repos/jctrow70-cyber/builtiq/commits/main --jq "{sha:.sha,date:.commit.committer.date,msg:.commit.message}" >> %OUT% 2>&1
echo ===GH_CHECKS=== >> %OUT%
gh api repos/jctrow70-cyber/builtiq/commits/67c0cc3fac59d674265a6ed3188a0ddd2c300da0/status --jq "{state:.state,sha:.sha,total:.total_count,statuses:[.statuses[]|{context:.context,state:.state,target:.target_url}]}" >> %OUT% 2>&1
echo ===GH_DEPLOY=== >> %OUT%
gh api "repos/jctrow70-cyber/builtiq/deployments?per_page=5" --jq ".[:5]|map({sha:.sha,env:.environment,created:.created_at,desc:.description})" >> %OUT% 2>&1
echo DONE >> %OUT%
