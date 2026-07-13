# BuiltIQ Windows dev setup — run once per machine, or anytime npm "is not recognized"
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -ImportExercises

param(
  [switch]$ImportExercises,
  [switch]$ImportDryRun
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root
Write-Host "BuiltIQ root: $Root" -ForegroundColor Cyan

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Resolve-Npm {
  Refresh-Path
  $cmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "${env:ProgramFiles}\nodejs\npm.cmd",
    "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
    "$env:LOCALAPPDATA\builtiq-node\node-v22.16.0-win-x64\npm.cmd"
  )
  foreach ($path in $candidates) {
    $resolved = Get-Item $path -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) { return $resolved.FullName }
  }
  return $null
}

function Ensure-Node {
  $npm = Resolve-Npm
  if ($npm) {
    Write-Host "Node/npm found: $npm" -ForegroundColor Green
    & $npm -v | ForEach-Object { Write-Host "npm $_" }
    $nodeDir = Split-Path $npm -Parent
    if ($env:Path -notlike "*$nodeDir*") {
      $env:Path = "$nodeDir;$env:Path"
    }
    return $npm
  }

  Write-Host ""
  Write-Host "Node.js is not installed or not on PATH." -ForegroundColor Yellow
  Write-Host "No admin? Run portable install (user folder only):" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install-node-portable.ps1"
  Write-Host ""
  Write-Host "Or with admin:" -ForegroundColor Yellow
  Write-Host "  winget install OpenJS.NodeJS.LTS"
  Write-Host "  https://nodejs.org/ — download LTS, check Add to PATH"
  Write-Host ""
  Write-Host "Then CLOSE this PowerShell window, open a NEW one, and run:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1"
  Write-Host ""
  exit 1
}

function Invoke-Npm([string]$Npm, [string[]]$Args) {
  Write-Host "> $Npm $($Args -join ' ')" -ForegroundColor DarkGray
  & $Npm @Args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$npmPath = Ensure-Node
Invoke-Npm $npmPath @('install')

if (-not (Test-Path '.env.local')) {
  Write-Host ""
  Write-Host "Create .env.local in the project root with:" -ForegroundColor Yellow
  Write-Host @"
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
"@ -ForegroundColor DarkGray
}

if ($ImportDryRun) {
  Invoke-Npm $npmPath @('run', 'import:exercises:production:dry')
} elseif ($ImportExercises) {
  Invoke-Npm $npmPath @('run', 'import:exercises:production')
  Invoke-Npm $npmPath @('run', 'import:alternatives')
}

Write-Host ""
Write-Host "Ready. Common commands from this folder:" -ForegroundColor Green
Write-Host "  npm run dev"
Write-Host "  npm run import:exercises:production:dry"
Write-Host "  npm run import:exercises:production"
Write-Host ""
Write-Host "Shortcut: double-click builtiq-setup.cmd in the repo root." -ForegroundColor Green
