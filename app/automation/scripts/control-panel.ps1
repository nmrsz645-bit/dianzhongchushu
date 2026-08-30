$ErrorActionPreference = "Continue"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AutomationDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RootDir = (Resolve-Path (Join-Path $AutomationDir "..")).Path
$ModeFile = Join-Path $RootDir "自动化模式.json"
$StatusFile = Join-Path $RootDir "状态面板.txt"
$LogDir = Join-Path $AutomationDir "logs"
$FallbackDir = Join-Path $RootDir "兜底"
$FallbackLogFile = Join-Path $FallbackDir "兜底日志.txt"
$FallbackStateFile = Join-Path $FallbackDir "兜底状态.json"

function Ensure-Dir($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Read-Mode {
  try {
    if (-not (Test-Path -LiteralPath $ModeFile)) {
      return [ordered]@{ platformEnabled = $true; fallbackEnabled = $true }
    }
    $mode = Get-Content -LiteralPath $ModeFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return [ordered]@{
      platformEnabled = [bool]$mode.platformEnabled
      fallbackEnabled = [bool]$mode.fallbackEnabled
    }
  } catch {
    return [ordered]@{ platformEnabled = $true; fallbackEnabled = $true }
  }
}

function Save-Mode($PlatformEnabled, $FallbackEnabled) {
  if (-not $PlatformEnabled -and -not $FallbackEnabled) {
    [System.Windows.Forms.MessageBox]::Show("至少选择一个出书模式。", "提示", "OK", "Warning") | Out-Null
    return $false
  }
  Ensure-Dir (Split-Path -Parent $ModeFile)
  [ordered]@{
    platformEnabled = [bool]$PlatformEnabled
    fallbackEnabled = [bool]$FallbackEnabled
  } | ConvertTo-Json | Set-Content -LiteralPath $ModeFile -Encoding UTF8
  return $true
}

function Mode-Text($Mode) {
  if ($Mode.platformEnabled -and $Mode.fallbackEnabled) { return "平台+兜底" }
  if ($Mode.platformEnabled) { return "仅平台" }
  if ($Mode.fallbackEnabled) { return "仅兜底" }
  return "未选择"
}

function Is-Running {
  $rootSlash = "$RootDir\"
  $matches = Get-CimInstance Win32_Process | Where-Object {
    $cmd = [string]$_.CommandLine
    $cmd.Contains($rootSlash) -and ($cmd.Contains("watchdog.ps1") -or $cmd.Contains("watch-40min.js"))
  }
  return [bool]$matches
}

function Start-Bat($Name) {
  $file = Join-Path $RootDir $Name
  if (-not (Test-Path -LiteralPath $file)) {
    [System.Windows.Forms.MessageBox]::Show("找不到：$file", "错误", "OK", "Error") | Out-Null
    return
  }
  Start-Process -FilePath $file -WorkingDirectory $RootDir
}

function Start-DetachedPowerShell($ScriptPath) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) -WorkingDirectory $RootDir
}

function Open-TextFile($RelativePath) {
  $file = Join-Path $RootDir $RelativePath
  if (-not (Test-Path -LiteralPath $file)) {
    New-Item -ItemType File -Path $file -Force | Out-Null
  }
  Start-Process -FilePath "notepad.exe" -ArgumentList $file
}

function Tail-File($Path, $Count = 160) {
  if (-not (Test-Path -LiteralPath $Path)) { return "未找到：$Path" }
  try {
    return (Get-Content -LiteralPath $Path -Encoding UTF8 -Tail $Count) -join "`r`n"
  } catch {
    return "读取失败：$($_.Exception.Message)"
  }
}

function Today-Log($Prefix) {
  Join-Path $LogDir ("{0}-{1}.log" -f $Prefix, (Get-Date).ToString("yyyy-MM-dd"))
}

function Fallback-Summary {
  if (-not (Test-Path -LiteralPath $FallbackStateFile)) { return "兜底状态：暂无" }
  try {
    $state = Get-Content -LiteralPath $FallbackStateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $books = @($state.books.PSObject.Properties | ForEach-Object { $_.Value })
    $done = @($books | Where-Object { $_.successAt }).Count
    $failed = @($books | Where-Object { $_.failCount -gt 0 -and -not $_.successAt }).Count
    $maxFail = 0
    foreach ($book in $books) {
      if ($book.failCount -gt $maxFail) { $maxFail = [int]$book.failCount }
    }
    return "兜底状态：记录 $($books.Count) 本，已完成 $done 本，失败中 $failed 本，最高失败 $maxFail 次"
  } catch {
    return "兜底状态读取失败：$($_.Exception.Message)"
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "点重自动化控制台"
$form.Size = New-Object System.Drawing.Size(980, 720)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)

$modeGroup = New-Object System.Windows.Forms.GroupBox
$modeGroup.Text = "运行模式"
$modeGroup.Location = New-Object System.Drawing.Point(12, 10)
$modeGroup.Size = New-Object System.Drawing.Size(300, 95)
$form.Controls.Add($modeGroup)

$platformCheck = New-Object System.Windows.Forms.CheckBox
$platformCheck.Text = "平台扫描出书"
$platformCheck.Location = New-Object System.Drawing.Point(18, 28)
$platformCheck.Size = New-Object System.Drawing.Size(130, 24)
$modeGroup.Controls.Add($platformCheck)

$fallbackCheck = New-Object System.Windows.Forms.CheckBox
$fallbackCheck.Text = "兜底链接出书"
$fallbackCheck.Location = New-Object System.Drawing.Point(155, 28)
$fallbackCheck.Size = New-Object System.Drawing.Size(130, 24)
$modeGroup.Controls.Add($fallbackCheck)

$saveModeButton = New-Object System.Windows.Forms.Button
$saveModeButton.Text = "保存模式"
$saveModeButton.Location = New-Object System.Drawing.Point(18, 58)
$saveModeButton.Size = New-Object System.Drawing.Size(90, 26)
$modeGroup.Controls.Add($saveModeButton)

$modeLabel = New-Object System.Windows.Forms.Label
$modeLabel.Location = New-Object System.Drawing.Point(118, 62)
$modeLabel.Size = New-Object System.Drawing.Size(160, 20)
$modeGroup.Controls.Add($modeLabel)

$controlGroup = New-Object System.Windows.Forms.GroupBox
$controlGroup.Text = "运行控制"
$controlGroup.Location = New-Object System.Drawing.Point(325, 10)
$controlGroup.Size = New-Object System.Drawing.Size(635, 95)
$form.Controls.Add($controlGroup)

$buttons = @(
  @{ Text = "启动7x24"; X = 15; Action = { if (Save-Mode $platformCheck.Checked $fallbackCheck.Checked) { Start-Bat "7x24守护运行.bat" } } },
  @{ Text = "停止全部"; X = 105; Action = { Start-Bat "一键停止.bat" } },
  @{ Text = "运行一次"; X = 195; Action = { Start-Bat "运行一次.bat" } },
  @{ Text = "一键自检"; X = 285; Action = { Start-Bat "一键自检.bat" } },
  @{ Text = "登录页面"; X = 375; Action = { Start-Bat "打开登录页面.bat" } },
  @{ Text = "一键基准"; X = 465; Action = { Start-Bat "一键基准.bat" } }
)

foreach ($item in $buttons) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $item.Text
  $button.Location = New-Object System.Drawing.Point($item.X, 24)
  $button.Size = New-Object System.Drawing.Size(80, 28)
  $action = $item.Action
  $button.Add_Click($action)
  $controlGroup.Controls.Add($button)
}

$bookIdLabel = New-Object System.Windows.Forms.Label
$bookIdLabel.Text = "书籍ID："
$bookIdLabel.Location = New-Object System.Drawing.Point(15, 62)
$bookIdLabel.Size = New-Object System.Drawing.Size(58, 20)
$controlGroup.Controls.Add($bookIdLabel)

$bookIdBox = New-Object System.Windows.Forms.TextBox
$bookIdBox.Location = New-Object System.Drawing.Point(75, 58)
$bookIdBox.Size = New-Object System.Drawing.Size(100, 24)
$controlGroup.Controls.Add($bookIdBox)

$runBookButton = New-Object System.Windows.Forms.Button
$runBookButton.Text = "处理单本书"
$runBookButton.Location = New-Object System.Drawing.Point(185, 56)
$runBookButton.Size = New-Object System.Drawing.Size(95, 28)
$runBookButton.Add_Click({
  $bookId = $bookIdBox.Text.Trim()
  if (-not $bookId) {
    [System.Windows.Forms.MessageBox]::Show("请输入书籍ID。", "提示", "OK", "Warning") | Out-Null
    return
  }
  Start-Process -FilePath (Join-Path $RootDir "处理单本书.bat") -ArgumentList $bookId -WorkingDirectory $RootDir
})
$controlGroup.Controls.Add($runBookButton)

$batchBookButton = New-Object System.Windows.Forms.Button
$batchBookButton.Text = "批量处理书籍"
$batchBookButton.Location = New-Object System.Drawing.Point(290, 56)
$batchBookButton.Size = New-Object System.Drawing.Size(105, 28)
$batchBookButton.Add_Click({ Start-Bat "批量处理书籍.bat" })
$controlGroup.Controls.Add($batchBookButton)

$statusBox = New-Object System.Windows.Forms.TextBox
$statusBox.Multiline = $true
$statusBox.ReadOnly = $true
$statusBox.ScrollBars = "Vertical"
$statusBox.Location = New-Object System.Drawing.Point(12, 115)
$statusBox.Size = New-Object System.Drawing.Size(470, 210)
$form.Controls.Add($statusBox)

$fallbackBox = New-Object System.Windows.Forms.TextBox
$fallbackBox.Multiline = $true
$fallbackBox.ReadOnly = $true
$fallbackBox.ScrollBars = "Vertical"
$fallbackBox.Location = New-Object System.Drawing.Point(490, 115)
$fallbackBox.Size = New-Object System.Drawing.Size(470, 210)
$form.Controls.Add($fallbackBox)

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Location = New-Object System.Drawing.Point(12, 335)
$tabs.Size = New-Object System.Drawing.Size(948, 245)
$form.Controls.Add($tabs)

function Add-LogTab($Title) {
  $tab = New-Object System.Windows.Forms.TabPage
  $tab.Text = $Title
  $box = New-Object System.Windows.Forms.TextBox
  $box.Multiline = $true
  $box.ReadOnly = $true
  $box.ScrollBars = "Both"
  $box.Dock = "Fill"
  $box.WordWrap = $false
  $tab.Controls.Add($box)
  $tabs.TabPages.Add($tab) | Out-Null
  return $box
}

$mainLogBox = Add-LogTab "主程序日志"
$watchdogLogBox = Add-LogTab "守护日志"
$fallbackLogBox = Add-LogTab "兜底日志"

$configGroup = New-Object System.Windows.Forms.GroupBox
$configGroup.Text = "配置文件"
$configGroup.Location = New-Object System.Drawing.Point(12, 590)
$configGroup.Size = New-Object System.Drawing.Size(948, 80)
$form.Controls.Add($configGroup)

$configs = @(
  @{ Text = "网址"; File = "网址.txt"; X = 15 },
  @{ Text = "飞书"; File = "飞书接口和链接.txt"; X = 85 },
  @{ Text = "企业微信"; File = "企业微信.txt"; X = 155 },
  @{ Text = "微信开关"; File = "企业微信发送开关.txt"; X = 245 },
  @{ Text = "DeepSeek"; File = "DeepSeek接口.txt"; X = 335 },
  @{ Text = "违禁词"; File = "违禁词.txt"; X = 425 },
  @{ Text = "资源ID"; File = "选择资源id.txt"; X = 505 },
  @{ Text = "兜底链接"; File = "兜底\新建文本文档.txt"; X = 585 },
  @{ Text = "说明"; File = "使用说明-点重自动化.txt"; X = 675 }
)

foreach ($cfg in $configs) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $cfg.Text
  $button.Location = New-Object System.Drawing.Point($cfg.X, 30)
  $button.Size = New-Object System.Drawing.Size(70, 28)
  $file = $cfg.File
  $button.Add_Click({ Open-TextFile $file }.GetNewClosure())
  $configGroup.Controls.Add($button)
}

function Refresh-Ui {
  $mode = Read-Mode
  $platformCheck.Checked = $mode.platformEnabled
  $fallbackCheck.Checked = $mode.fallbackEnabled
  $runningText = if (Is-Running) { "运行中" } else { "未运行" }
  $modeLabel.Text = "当前：" + (Mode-Text $mode)
  $statusText = if (Test-Path -LiteralPath $StatusFile) { Get-Content -LiteralPath $StatusFile -Raw -Encoding UTF8 } else { "状态面板：暂无" }
  $statusBox.Text = "当前北京时间：$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))`r`n当前状态：$runningText`r`n运行模式：$(Mode-Text $mode)`r`n`r`n$statusText"
  $fallbackBox.Text = (Fallback-Summary) + "`r`n`r`n" + (Tail-File $FallbackLogFile 40)
  $mainLogBox.Text = Tail-File (Today-Log "run") 120
  $watchdogLogBox.Text = Tail-File (Today-Log "watchdog") 120
  $fallbackLogBox.Text = Tail-File $FallbackLogFile 120
}

$saveModeButton.Add_Click({
  if (Save-Mode $platformCheck.Checked $fallbackCheck.Checked) {
    Refresh-Ui
    [System.Windows.Forms.MessageBox]::Show("运行模式已保存。", "完成", "OK", "Information") | Out-Null
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Refresh-Ui })
$timer.Start()

Refresh-Ui
[void]$form.ShowDialog()
