@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
"C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" -e "const fs=require('fs'); const s=fs.readFileSync('.next/static/chunks/app/page.js','utf8'); const needles=['BrowserMultiFormatReader','DecodeHintType','GroupsHub','ProgramDesignHome','ProgressScreen','NutritionTracker','UnifiedTrainingSchedule','fetchAllExerciseCatalog','generateProgram']; for (const n of needles) console.log(n+': '+(s.includes(n)?'yes':'no')); console.log('bytes '+s.length);" > "%TEMP%\biq-page-markers.txt"
netstat -ano | findstr ":3000 :3002" >> "%TEMP%\biq-page-markers.txt"
