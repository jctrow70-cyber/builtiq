@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" -e "const fs=require('fs'); const s=fs.readFileSync('.next/static/chunks/app/page.js','utf8'); const needles=['SCIENCE_ENGINE_VERSION','FALLBACK_CATALOG','runGenerationPipeline','function generateProgram(','BrowserMultiFormatReader','evaluateProgressionDecision','qualityPass']; for (const n of needles) console.log(n+': '+(s.includes(n)?'yes':'no'));" > "%TEMP%\biq-gen-snip.txt"
