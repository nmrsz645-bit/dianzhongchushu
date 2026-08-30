[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Protect-Text {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) { return '' }

    $result = $Text
    $result = [regex]::Replace($result, '(?im)(password|passwd|secret|token|api[_ -]?key|access[_ -]?key)\s*[:=]\s*[^\s,;]+', '$1=***')
    $result = [regex]::Replace($result, '(?i)LTAI[A-Za-z0-9]+', '***')
    return $result
}

function Get-RecentLogs {
    param([Parameter(Mandatory)][string]$Root)

    $logRoots = @('logs', 'log') | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Container }
    $files = foreach ($logRoot in $logRoots) {
        Get-ChildItem -LiteralPath $logRoot -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -le 512KB } |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 3
    }

    foreach ($file in @($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 5)) {
        try {
            $content = [IO.File]::ReadAllText($file.FullName)
            if ($content.Length -gt 50000) { $content = $content.Substring($content.Length - 50000) }
            [PSCustomObject]@{
                file = $file.Name
                modifiedAt = $file.LastWriteTimeUtc.ToString('o')
                text = Protect-Text $content
            }
        }
        catch {
            [PSCustomObject]@{ file = $file.Name; modifiedAt = $file.LastWriteTimeUtc.ToString('o'); text = 'Unable to read this log file.' }
        }
    }
}

$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot 'feedback-config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$description = Read-Host '请简要描述问题（可留空）'
$system = Get-CimInstance Win32_OperatingSystem

$report = [ordered]@{
    schemaVersion = 1
    reportId = [guid]::NewGuid().ToString('N')
    createdAt = [DateTime]::UtcNow.ToString('o')
    appId = $config.appId
    appName = $config.appName
    appVersion = $config.appVersion
    description = Protect-Text $description
    system = [ordered]@{
        caption = $system.Caption
        version = $system.Version
        architecture = $system.OSArchitecture
    }
    logs = @(Get-RecentLogs -Root $root)
}

$localDirectory = Join-Path $root 'reports-local'
New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
$localPath = Join-Path $localDirectory ("report-" + $report.reportId + '.json')
$json = $report | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText($localPath, $json, [Text.UTF8Encoding]::new($false))

if ([string]::IsNullOrWhiteSpace($config.endpoint)) {
    Write-Host '报错信息已安全保存到本机。报错上传服务配置完成后会自动提交。'
    Start-Process explorer.exe "/select,`"$localPath`""
    exit 0
}

try {
    Invoke-RestMethod -Uri $config.endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body $json -TimeoutSec 30 | Out-Null
    Remove-Item -LiteralPath $localPath -Force
    Write-Host '报错已提交，谢谢。'
}
catch {
    Write-Host '暂时无法提交，报错信息已保存在本机，稍后可再次提交。'
    Start-Process explorer.exe "/select,`"$localPath`""
}

Read-Host '按回车键关闭'