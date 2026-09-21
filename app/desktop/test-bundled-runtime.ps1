$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BuildScript = Join-Path $PSScriptRoot "build-desktop.ps1"
$BundledNode = Join-Path $AppRoot "runtime\node\node.exe"
$UpdaterConfigPath = Join-Path (Split-Path -Parent $AppRoot) "updater\updater-config.json"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildScript
if ($LASTEXITCODE -ne 0) {
    throw "Desktop build failed."
}

if (-not (Test-Path -LiteralPath $BundledNode -PathType Leaf)) {
    throw "Desktop build must include runtime\\node\\node.exe for computers without a system Node.js installation."
}

$BundledNodeVersion = (& $BundledNode --version).Trim()
if ($LASTEXITCODE -ne 0 -or $BundledNodeVersion -notmatch '^v24\.') {
    throw "Bundled Node runtime is not a runnable Node.js 24 executable: $BundledNodeVersion"
}

$UpdaterConfig = Get-Content -Raw -LiteralPath $UpdaterConfigPath | ConvertFrom-Json
if ($UpdaterConfig.requiredFiles -notcontains "runtime\node\node.exe") {
    throw "Updater requiredFiles must include runtime\\node\\node.exe."
}

Write-Host "Bundled runtime test passed: $BundledNodeVersion"
