@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=docs\catalog-overhaul\_env-bundle.txt
echo ===BUNDLE=== > %OUT%
"%NODE%" -e "const fs=require('fs'); const s=fs.readFileSync('.next/static/chunks/app/page.js','utf8'); const keys=['contextScore','opts.section','section: panel.section','sec === \"strength\"','strengthLike ? 90','compatibleEquipmentOptions']; keys.forEach(k=>fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', k+'='+s.includes(k)+'\n')); const i=s.indexOf('function contextScore'); fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', 'contextScore_idx='+i+'\n'); if(i>=0) fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', s.slice(i,i+420)+'\n'); const j=s.indexOf('section: panel.section'); fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt','panel.section_idx='+j+'\n'); if(j>=0) fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', s.slice(j-80,j+80)+'\n');"
echo ===PROD_HTML=== >> %OUT%
curl.exe -s https://builtiq-duf7.vercel.app/ -o docs\catalog-overhaul\_prod.html
"%NODE%" -e "const fs=require('fs'); const h=fs.readFileSync('docs/catalog-overhaul/_prod.html','utf8'); fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', 'html_len='+h.length+'\n'); const m=h.match(/\/_next\/static\/[^\"']+/g)||[]; fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt', (m.slice(0,12).join('\n')||'no_static')+'\n'); const bid=h.match(/\"buildId\":\"([^\"]+)\"/); fs.appendFileSync('docs/catalog-overhaul/_env-bundle.txt','buildId='+(bid?bid[1]:'none')+'\n');"
echo ===PROD_BUILDID=== >> %OUT%
curl.exe -sI https://builtiq-duf7.vercel.app/_next/static/BUILD_ID >> %OUT% 2>&1
curl.exe -s https://builtiq-duf7.vercel.app/_next/static/BUILD_ID >> %OUT% 2>&1
echo. >> %OUT%
echo ===LOCAL_BUILDID=== >> %OUT%
if exist .next\BUILD_ID type .next\BUILD_ID >> %OUT%
echo. >> %OUT%
echo DONE >> %OUT%
