$ErrorActionPreference = "Stop"

$TaskName = "DianzhongAutomationWatchdog"
$ShortcutName = "DianzhongAutomationWatchdog.lnk"
$AutomationDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RootDir = (Resolve-Path (Join-Path $AutomationDir "..")).Path
$WatchdogScript = Join-Path $AutomationDir "scripts\watchdog.ps1"
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $WatchdogScript)) {
  throw "watchdog script not found: $WatchdogScript"
}

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchdogScript`"" -WorkingDirectory $RootDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 30) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive

try {
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Start Dianzhong automation watchdog after user logon." -Force | Out-Null
  $Method = "scheduled task"
} catch {
  $taskRun = '"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}"' -f $PowerShell, $WatchdogScript
  $result = & schtasks.exe /Create /TN $TaskName /SC ONLOGON /TR $taskRun /F 2>&1
  if ($LASTEXITCODE -ne 0) {
    $shortcut = New-Object -ComObject WScript.Shell
    $path = Join-Path ([Environment]::GetFolderPath("Startup")) $ShortcutName
    $link = $shortcut.CreateShortcut($path)
    $link.TargetPath = $PowerShell
    $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchdogScript`""
    $link.WorkingDirectory = $RootDir
    $link.WindowStyle = 7
    $link.Save()
    $Method = "startup shortcut"
  } else {
    $Method = "schtasks"
  }
}

Write-Host "Autostart enabled. Method: $Method"
