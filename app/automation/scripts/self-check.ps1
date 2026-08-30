$ErrorActionPreference = "Stop"

$AutomationDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$RootDir = Resolve-Path (Join-Path $AutomationDir "..")
$Problems = New-Object System.Collections.Generic.List[string]

function U([int[]]$Codes) {
  return -join ($Codes | ForEach-Object { [char]$_ })
}

function Info($Text) { Write-Host "[CHECK] $Text" -ForegroundColor Cyan }
function Ok($Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Warn($Text) { Write-Host "[FAIL] $Text" -ForegroundColor Yellow; $Problems.Add($Text) | Out-Null }

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-NodePath {
  if ($env:DZ_NODE_PATH -and (Test-Path -LiteralPath $env:DZ_NODE_PATH)) { return $env:DZ_NODE_PATH }
  $bundledNode = Join-Path $RootDir "runtime\node\node.exe"
  if (Test-Path -LiteralPath $bundledNode) { return $bundledNode }
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (Test-Path $programFilesNode) {
    $env:Path = "$(Split-Path $programFilesNode);$env:Path"
    return $programFilesNode
  }
  return ""
}

function Install-NodeLts {
  if (-not (Test-Admin)) {
    Info "Node.js is missing. Requesting administrator permission to install it..."
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
  }

  Info "Fetching latest Node.js LTS metadata..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $versions = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $version = ($versions | Where-Object { $_.lts } | Select-Object -First 1).version
  if (-not $version) { throw "Could not resolve Node.js LTS version" }

  $msi = "node-$version-x64.msi"
  $url = "https://nodejs.org/dist/$version/$msi"
  $target = Join-Path $env:TEMP $msi
  Info "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $target

  Info "Installing Node.js $version"
  $process = Start-Process msiexec.exe -ArgumentList "/i `"$target`" /qn /norestart" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Node.js install failed, msiexec exit code: $($process.ExitCode)" }
}

function Ensure-Node {
  $node = Get-NodePath
  if (-not $node) { throw "node.exe was not found after install" }
  $script:NodePath = $node
  $version = & $node -v
  Ok "Node.js $version"
}

function Ensure-NpmInstall {
  Push-Location $AutomationDir
  try {
    if (-not (Test-Path (Join-Path $AutomationDir "node_modules\playwright-core"))) {
      throw "Node dependencies are missing. Please use the complete desktop package."
    }
    Ok "Node dependencies"
  } finally {
    Pop-Location
  }
}

function Check-Chrome {
  $paths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )
  if ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1) { Ok "Google Chrome" }
  else { Warn "Google Chrome was not found" }
}

function Check-ConfigFiles {
  $urlFile = "$(U @(0x7F51,0x5740)).txt"
  $wechatFile = "$(U @(0x4F01,0x4E1A,0x5FAE,0x4FE1)).txt"
  $feishuFile = "$(U @(0x98DE,0x4E66,0x63A5,0x53E3,0x548C,0x94FE,0x63A5)).txt"
  $resourceFile = "$(U @(0x9009,0x62E9,0x8D44,0x6E90))id.txt"
  $forbiddenFile = "$(U @(0x8FDD,0x7981,0x8BCD)).txt"

  $checks = @(
    @{ Name = $urlFile; Pattern = '^https?://'; Message = "must be a URL starting with http:// or https://" },
    @{ Name = $wechatFile; Pattern = 'qyapi\.weixin\.qq\.com.+key='; Message = "must be a WeCom webhook URL containing key=" },
    @{ Name = $feishuFile; Pattern = '(?s)(?=.*App ID\s*[:：]\s*\S+)(?=.*App Secret\s*[:：]\s*\S+)(?=.*https?://\S+).+'; Message = "must contain App ID, App Secret, and a Feishu URL" },
    @{ Name = $resourceFile; Pattern = '^\d+$'; Message = "must be numeric resource id" }
  )
  foreach ($check in $checks) {
    $name = $check.Name
    $file = Join-Path $RootDir $name
    if (-not (Test-Path $file)) { Warn "Missing config file: $name"; continue }
    # Get-Content returns $null for a zero-byte file; normalize it before Trim.
    $content = [string](Get-Content -LiteralPath $file -Raw)
    $content = $content.Trim()
    if (-not $content) { Warn "Empty config file: $name"; continue }
    if ($content -match '请填写|示例|xxxx|\.\.\.') { Warn "Placeholder config file: $name"; continue }
    if ($content -notmatch $check.Pattern) { Warn "Invalid config file: $name, $($check.Message)"; continue }
    Ok "Config file: $name"
  }

  $forbidden = Join-Path $RootDir $forbiddenFile
  if (Test-Path $forbidden) { Ok "Config file: $forbiddenFile" } else { Warn "Missing config file: $forbiddenFile" }
}

function Check-CoreScripts {
  Push-Location $AutomationDir
  try {
    $scripts = @(
      "src\state.js",
      "src\logger.js",
      "src\notification-utils.js",
      "src\settings.js",
      "src\status-utils.js",
      "src\browser.js",
      "src\pending-feishu.js",
      "src\safe-append.js",
      "src\scan-once.js",
      "src\baseline-now.js",
      "src\watch-40min.js",
      "src\platform-browser.js",
      "src\run-book.js",
      "src\run-books.js"
    )
    foreach ($script in $scripts) {
      & $NodePath -c $script
      if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $script" }
    }
    Ok "Core script syntax"

    $fallbackTest = "..\" + (U @(0x515C, 0x5E95)) + "\test-fallback-utils.js"
    $tests = @(
      "test\text-utils.test.js", "test\ai-tags.test.js", "test\feishu-utils.test.js", "test\platform-utils.test.js",
      "test\state.test.js", "test\logger.test.js", "test\settings.test.js", "test\status-utils.test.js",
      "test\wechat-send-setting.test.js", "test\fallback-failure.test.js", "test\mode-settings.test.js",
      "test\process-lock.test.js", "test\watch-lock.test.js", "test\browser-errors.test.js",
      "test\safe-append.test.js", "test\pending-feishu.test.js", "test\scan-failure-classification.test.js",
      $fallbackTest, "test\run-book-order.test.js"
    )
    foreach ($test in $tests) {
      & $NodePath $test
      if ($LASTEXITCODE -ne 0) { throw "Automated tests failed: $test" }
    }
    Ok "Automated tests"
  } finally {
    Pop-Location
  }
}

function Check-LoginProfile {
  $profile = Join-Path $RootDir "ChromeProfile"
  if (Test-Path $profile) { Ok "ChromeProfile exists" }
  else { Warn "ChromeProfile is missing. Run the login launcher and sign in first." }
}

Write-Host ""
Write-Host "Dianzhong automation self-check" -ForegroundColor White
Write-Host "Root: $RootDir"
Write-Host ""

try {
  Ensure-Node
  Ensure-NpmInstall
  Check-Chrome
  Check-ConfigFiles
  Check-LoginProfile
  Check-CoreScripts
} catch {
  Warn $_.Exception.Message
}

Write-Host ""
if ($Problems.Count -eq 0) {
  Write-Host "Self-check completed: all checks passed." -ForegroundColor Green
  exit 0
}

Write-Host "Self-check completed: $($Problems.Count) problem(s) found." -ForegroundColor Yellow
foreach ($problem in $Problems) {
  Write-Host "- $problem" -ForegroundColor Yellow
}
exit 1
