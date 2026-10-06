@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
curl.exe -s "https://builtiq-duf7.vercel.app/_next/static/chunks/44530001-5f14bd668763d549.js" -o docs\catalog-overhaul\_prod-445.js
"%NODE%" -e "const fs=require('fs'); const files=['docs/catalog-overhaul/_prod-page.js','docs/catalog-overhaul/_prod-398.js','docs/catalog-overhaul/_prod-980.js','docs/catalog-overhaul/_prod-991.js','docs/catalog-overhaul/_prod-445.js']; const keys=['contextScore','panel.section','strengthLike','searchCatalog','compatibleEquipmentOptions','ergometer','Rear Lunge','Diverging Row','-80','textHasToken','Add Exercise']; let out=''; files.forEach(f=>{const s=fs.existsSync(f)?fs.readFileSync(f,'utf8'):''; out+=f+' len='+s.length+'\n'; keys.forEach(k=>out+='  '+k+'='+s.includes(k)+'\n');}); fs.writeFileSync('docs/catalog-overhaul/_prod-js2.txt', out);"
