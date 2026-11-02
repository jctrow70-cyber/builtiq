@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_splice-catalog.cmd scripts\_close-programs.cmd scripts\_cleanup-phase-c.cmd scripts\_run-phase-c-tests.cmd scripts\_tsc-phase-c.cmd scripts\_measure-dev-bundle.cmd scripts\_start-next-3002.cmd scripts\_port-3002.cmd scripts\_wait-measure.cmd scripts\_curl-3002.cmd scripts\_after-sizes.cmd scripts\_find-bench.cmd scripts\_recheck-c.cmd scripts\_tsc-only.cmd scripts\_wait4.cmd scripts\_prod-build.cmd scripts\_prod-sizes.cmd scripts\_prod-markers.cmd scripts\_prod-needles.cmd 2>nul
if exist lib\performance\lazyScreen.tsx del /q lib\performance\lazyScreen.tsx
echo CLEANED
del /q "%~f0"
