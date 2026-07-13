# Install portable Node.js to your user folder — NO admin rights required.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-node-portable.ps1

$ErrorActionPreference = 'Stop'

# Node 22 LTS Windows x64 (portable zip — no installer)
$NodeVersion = '22.16.0'
$ZipName = "node-v$NodeVersion-win-x64.zip"
$Url = "https://nodejs.org/dist/v$NodeVersion/$ZipName"
$InstallRoot = Join-Path $env:LOCALAPPDATA 'builtiq-node'
$NodeDir = Join-Path $InstallRoot "node-v$NodeVersion-win-x64"
$ZipPath = Join-Path $InstallRoot $ZipName

Write-Host "BuiltIQ portable Node (no admin)" -ForegroundColor Cyan
Write-Host "Install folder: $NodeDir"

if (Test-Path (Join-Path $NodeDir 'npm.cmd')) {
  Write-Host "Node already installed at $NodeDir" -ForegroundColor Green
} else {
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  Write-Host "Downloading $Url ..."
  Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
  Write-Host "Extracting..."
  Expand-Archive -Path $ZipPath -DestinationPath $InstallRoot -Force
  Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
  Write-Host "Installed to $NodeDir" -ForegroundColor Green
}

# Add to USER path (no admin)
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$NodeDir*") {
  $newPath = if ($userPath) { "$userPath;$NodeDir" } else { $NodeDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Host "Added to your user PATH (permanent for your account)." -ForegroundColor Green
}

$env:Path = "$NodeDir;$env:Path"
Write-Host "node: $(& (Join-Path $NodeDir 'node.exe') -v)"
Write-Host "npm:  $(& (Join-Path $NodeDir 'npm.cmd') -v)"
Write-Host ""
Write-Host "Close and reopen PowerShell, then run builtiq-setup.cmd" -ForegroundColor Yellow
Write-Host "Or continue now from repo root:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1"
