$ErrorActionPreference = "Continue"

$AutomationDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$RootDir = Resolve-Path (Join-Path $AutomationDir "..")
$LogDir = Join-Path $AutomationDir "logs"
$DataDir = Join-Path $AutomationDir "data"
$WatchdogPsLock = Join-Path $DataDir "watchdog-ps.lock"
$BundledNode = Join-Path $RootDir "runtime\node\node.exe"
$NodeExecutable = if ($env:DZ_NODE_PATH -and (Test-Path -LiteralPath $env:DZ_NODE_PATH)) { $env:DZ_NODE_PATH } elseif (Test-Path -LiteralPath $BundledNode) { $BundledNode } else { "node.exe" }
$RestartDelaySeconds = 10

function Ensure-Dir($Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Write-WatchdogLog($Message) {
  Ensure-Dir $LogDir
  $now = Get-Date
  $line = "[{0}] {1}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -LiteralPath (Join-Path $LogDir ("watchdog-{0}.log" -f $now.ToString("yyyy-MM-dd"))) -Value $line -Encoding UTF8
}

function Test-WatchdogProcess($ProcessId) {
  if (-not $ProcessId) { return $false }
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$ProcessId)" -ErrorAction Stop
    if (-not $process) { return $false }
    $commandLine = [string]$process.CommandLine
    $expectedScript = (Join-Path $AutomationDir "scripts\watchdog.ps1").Replace('/', '\\')
    return $commandLine.Replace('/', '\\').Contains($expectedScript)
  } catch {
    return $false
  }
}

function Read-LockPid($Path) {
  try {
    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    return [int]$json.pid
  } catch {
    return 0
  }
}

function Acquire-WatchdogLock {
  Ensure-Dir $DataDir
  if (Test-Path -LiteralPath $WatchdogPsLock) {
    $existingPid = Read-LockPid $WatchdogPsLock
    if (Test-WatchdogProcess $existingPid) {
      Write-WatchdogLog "another watchdog is already running, pid=$existingPid"
      return $false
    }
    Remove-Item -LiteralPath $WatchdogPsLock -Force -ErrorAction SilentlyContinue
  }
  @{ pid = $PID; createdAt = (Get-Date).ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $WatchdogPsLock -Encoding UTF8
  return $true
}

if (-not (Acquire-WatchdogLock)) {
  exit 77
}

Write-WatchdogLog "watchdog started"
Write-WatchdogLog "starting node src\watch-40min.js"

try {
  while ($true) {
    Push-Location $AutomationDir
    try {
      & $NodeExecutable (Join-Path $AutomationDir "src\watch-40min.js")
      $exitCode = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    if ($exitCode -eq 77) { break }
    Write-WatchdogLog "node watcher exited with code $exitCode; restarting in $RestartDelaySeconds seconds"
    Start-Sleep -Seconds $RestartDelaySeconds
  }
} finally {
  Remove-Item -LiteralPath $WatchdogPsLock -Force -ErrorAction SilentlyContinue
}
