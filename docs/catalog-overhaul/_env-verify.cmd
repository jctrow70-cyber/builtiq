@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
git rev-parse --abbrev-ref HEAD > docs\catalog-overhaul\_env-verify.txt
git rev-parse HEAD >> docs\catalog-overhaul\_env-verify.txt
git log -1 --format=%%H%%n%%s%%n%%ci >> docs\catalog-overhaul\_env-verify.txt
echo ---STATUS--- >> docs\catalog-overhaul\_env-verify.txt
git status -sb >> docs\catalog-overhaul\_env-verify.txt
echo ---REMOTE--- >> docs\catalog-overhaul\_env-verify.txt
git rev-parse origin/main >> docs\catalog-overhaul\_env-verify.txt
git rev-parse origin/develop >> docs\catalog-overhaul\_env-verify.txt
git log origin/main -1 --format=main:%%h%%s >> docs\catalog-overhaul\_env-verify.txt
git log origin/develop -1 --format=develop:%%h%%s >> docs\catalog-overhaul\_env-verify.txt
echo ---BIQ0235--- >> docs\catalog-overhaul\_env-verify.txt
git log --oneline --all --grep=BIQ-0235 -n 5 >> docs\catalog-overhaul\_env-verify.txt
git log --oneline --all --grep=BIQ-0237 -n 5 >> docs\catalog-overhaul\_env-verify.txt
