$ErrorActionPreference = "Continue"

$AutomationDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RootDir = (Resolve-Path (Join-Path $AutomationDir "..")).Path
$ChromeProfile = Join-Path $RootDir "ChromeProfile"
$CurrentPid = $PID

function Normalize($Text) {
  return [string]$Text
}

function Is-RootAutomationCommand($CommandLine) {
  $cmd = Normalize $CommandLine
  $rootSlash = "$RootDir\"
  if (-not $cmd.Contains($rootSlash)) { return $false }
  return @(
    "7x24守护运行.bat",
    "每40分钟监控.bat",
    "运行一次.bat",
    "一键基准.bat",
    "打开登录页面.bat",
    "处理单本书.bat",
    "批量处理书籍.bat",
    "watchdog.ps1",
    "scan-once.js",
    "watch-40min.js",
    "run-book.js",
    "run-books.js",
    "baseline-now.js",
    "open-login.js",
    "watch-fallback.js",
    "run-once.js"
  ) | Where-Object { $cmd.Contains($_) } | Select-Object -First 1
}

function Is-DirectTargetProcess($Process) {
  $name = [string]$Process.Name
  $cmd = Normalize $Process.CommandLine
  if (-not $cmd) { return $false }
  if ($Process.ProcessId -eq $CurrentPid) { return $false }

  if (($name -in @("node.exe", "powershell.exe", "pwsh.exe", "cmd.exe")) -and (Is-RootAutomationCommand $cmd)) {
    return $true
  }
  if (($name -eq "chrome.exe") -and $cmd.Contains($ChromeProfile)) {
    return $true
  }
  return $false
}

function Add-Descendants($AllProcesses, $SeedIds) {
  $targetIds = @{}
  foreach ($id in $SeedIds) { $targetIds[[int]$id] = $true }

  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $AllProcesses) {
      if ($targetIds.ContainsKey([int]$process.ProcessId)) { continue }
      if ($targetIds.ContainsKey([int]$process.ParentProcessId)) {
        $targetIds[[int]$process.ProcessId] = $true
        $changed = $true
      }
    }
  }
  return $targetIds.Keys
}

Write-Host "Stopping Dianzhong automation processes under: $RootDir"

$all = Get-CimInstance Win32_Process
$direct = $all | Where-Object { Is-DirectTargetProcess $_ }
$targetIds = Add-Descendants $all ($direct | Select-Object -ExpandProperty ProcessId)
$targets = $all | Where-Object { $targetIds -contains [int]$_.ProcessId } | Sort-Object ProcessId -Descending

if (-not $targets) {
  Write-Host "No matching process found."
  exit 0
}

foreach ($target in $targets) {
  if ($target.ProcessId -eq $CurrentPid) { continue }
  Write-Host ("Stopping PID {0} {1}" -f $target.ProcessId, $target.Name)
  try {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  } catch {
    Write-Host ("Failed to stop PID {0}: {1}" -f $target.ProcessId, $_.Exception.Message)
  }
}

Write-Host "Stop command completed."

$DataDir = Join-Path $AutomationDir "data"
Remove-Item -LiteralPath (Join-Path $DataDir "watchdog.lock") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $DataDir "watchdog-ps.lock") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $DataDir "locks") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Lock files cleaned."
