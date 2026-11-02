@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
"%NODE%" -e "const fs=require('fs');const path=require('path');function walk(d,acc){for(const n of fs.readdirSync(d)){const p=path.join(d,n);const s=fs.statSync(p);if(s.isDirectory()){if(n==='node_modules'||n==='.next')continue;walk(p,acc);}else if(/\.(tsx|ts|js|jsx)$/.test(n))acc.push([s.size,p]);}}const acc=[];walk('app',acc);walk('lib',acc);acc.sort((a,b)=>b[0]-a[0]);const top=acc.slice(0,25).map(([s,p])=>String(s).padStart(8)+' '+p);const sum=(dir)=>acc.filter(([,p])=>p.startsWith(dir)).reduce((n,[s])=>n+s,0);console.log(top.join('\n'));console.log('APP',sum('app'));console.log('LIB',sum('lib'));console.log('PAGE',fs.statSync('app/page.tsx').size);console.log('ZXING_BROWSER',fs.statSync('node_modules/@zxing/browser/package.json')&& 'present');" > "%TEMP%\biq-src-sizes.txt" 2>&1
dir /s /-c node_modules\@zxing\browser\esm 2>nul | findstr /i "File(s)" >> "%TEMP%\biq-src-sizes.txt"
dir /s /-c node_modules\@zxing\library\esm 2>nul | findstr /i "File(s)" >> "%TEMP%\biq-src-sizes.txt"
