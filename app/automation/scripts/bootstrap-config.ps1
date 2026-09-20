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
Ensure-Template ((Name @(0x4F01, 0x4E1A, 0x5FAE, 0x4FE1)) + ".txt") "Fill the WeCom webhook URL"
Ensure-Template ((Name @(0x98DE, 0x4E66, 0x63A5, 0x53E3, 0x548C, 0x94FE, 0x63A5)) + ".txt") "Fill Feishu App ID, App Secret, and sheet URL"
Ensure-Template ((Name @(0x9009, 0x62E9, 0x8D44, 0x6E90)) + "id.txt") "Fill numeric resource ID"
Ensure-Template ((Name @(0x8FDD, 0x7981, 0x8BCD)) + ".txt") ""
Ensure-Template ("DeepSeek" + (Name @(0x63A5, 0x53E3)) + ".txt") "Enable: no`r`nAPI Key:`r`nModel: deepseek-v4-flash-0731`r`nEndpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
Ensure-Template ((Name @(0x7F51, 0x7AD9, 0x5BC6, 0x7801)) + ".txt") ""
$FallbackDir = Name @(0x515C, 0x5E95)
$FallbackFile = (Name @(0x65B0, 0x5EFA, 0x6587, 0x672C, 0x6587, 0x6863)) + ".txt"
Ensure-Template (Join-Path $FallbackDir $FallbackFile) "One fallback Feishu sheet URL per line"
