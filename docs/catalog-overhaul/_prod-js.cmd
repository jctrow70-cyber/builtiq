@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set OUT=docs\catalog-overhaul\_prod-js.txt
echo ===FETCH=== > %OUT%
curl.exe -s "https://builtiq-duf7.vercel.app/_next/static/chunks/app/page-4e0a2407b296485b.js" -o docs\catalog-overhaul\_prod-page.js
curl.exe -s "https://builtiq-duf7.vercel.app/_next/static/chunks/398-7fd0aff433939bc3.js" -o docs\catalog-overhaul\_prod-398.js
curl.exe -s "https://builtiq-duf7.vercel.app/_next/static/chunks/980-fa5e055a602d4579.js" -o docs\catalog-overhaul\_prod-980.js
curl.exe -s "https://builtiq-duf7.vercel.app/_next/static/chunks/991-91b41a73da65286e.js" -o docs\catalog-overhaul\_prod-991.js
"%NODE%" -e "const fs=require('fs'); const files=['docs/catalog-overhaul/_prod-page.js','docs/catalog-overhaul/_prod-398.js','docs/catalog-overhaul/_prod-980.js','docs/catalog-overhaul/_prod-991.js']; const keys=['contextScore','panel.section','strengthLike','searchCatalog','compatibleEquipmentOptions','Diverging Row','Seated Overhead Press']; let out=''; files.forEach(f=>{const s=fs.readFileSync(f,'utf8'); out+=f+' len='+s.length+'\n'; keys.forEach(k=>out+= '  '+k+'='+s.includes(k)+'\n');}); fs.writeFileSync('docs/catalog-overhaul/_prod-js.txt', out);"
echo DONE >> %OUT%
