$ErrorActionPreference = "Continue"

$TaskName = "DianzhongAutomationWatchdog"
$ShortcutName = "DianzhongAutomationWatchdog.lnk"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
} else {
  & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
}

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) $ShortcutName
if (Test-Path -LiteralPath $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
}
Write-Host "Autostart disabled."
