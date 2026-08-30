$ErrorActionPreference = "Stop"

$AutomationDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RootDir = (Resolve-Path (Join-Path $AutomationDir "..")).Path

function Name([int[]]$CodePoints) {
  return -join ($CodePoints | ForEach-Object { [char]$_ })
}

function Ensure-Template([string]$Name, [string]$Content) {
  $file = Join-Path $RootDir $Name
  if (-not (Test-Path -LiteralPath $file)) {
    Set-Content -LiteralPath $file -Value $Content -Encoding UTF8
  }
}

Ensure-Template ((Name @(0x7F51, 0x5740)) + ".txt") "https://admin.wqxsw.com/"
Ensure-Template ((Name @(0x4F01, 0x4E1A, 0x5FAE, 0x4FE1)) + ".txt") "Fill in the WeCom webhook URL"
Ensure-Template ((Name @(0x98DE, 0x4E66, 0x63A5, 0x53E3, 0x548C, 0x94FE, 0x63A5)) + ".txt") "Fill in Feishu App ID, App Secret, and sheet URL"
Ensure-Template ("DeepSeek" + (Name @(0x63A5, 0x53E3)) + ".txt") "启用：否`r`nAPI Key：`r`n模型：deepseek-chat"
Ensure-Template ((Name @(0x7F51, 0x7AD9, 0x5BC6, 0x7801)) + ".txt") ""
Ensure-Template ((Name @(0x515C, 0x5E95)) + "\" + (Name @(0x65B0, 0x5EFA, 0x6587, 0x672C, 0x6587, 0x6863)) + ".txt") "One fallback Feishu sheet URL per line"
