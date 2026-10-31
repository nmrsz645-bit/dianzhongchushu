# 点重出书维护交接

当前维护版本：`1.1.27`。权威源码仓库为 `https://github.com/nmrsz645-bit/dianzhongchushu`，默认分支 `main`；GitHub Release 标签为 `v1.1.27`。发布版本以 `app/version.json` 为准，不以目录名、EXE 修改日期或 OSS 文件名为准。

新 Windows 电脑接手、GitHub 完整包、客户端自动更新与下载站的分工见 [docs/RELEASE-GUIDE.md](docs/RELEASE-GUIDE.md)。特别注意：推送源码或文档分支不等于客户端更新或网站发布。

## 用途与架构

这是 Windows 本地桌面自动化程序：WinForms 桌面界面负责配置、状态和人工触发；Node.js 自动化负责浏览器扫描、出书、标签、飞书和通知；PowerShell 脚本负责自检、守护和开机自启。程序不会随源码携带用户登录态或业务数据。

```
Start.cmd -> app/Start-App.cmd -> app/DianzhongDesktop.exe
                                     |-> app/runtime/node/node.exe
                                     |-> app/automation/src/*.js
                                     |-> app/automation/scripts/*.ps1
```

## 目录与关键模块

- `app/desktop/PointChongDesktop.cs`：WinForms 界面；`build-desktop.ps1` 编译 EXE，并下载/校验内置 Node 24.19.0 x64。
- `app/automation/src/`：Node 业务自动化。`scan-once.js` 为单次扫描入口，`watch-40min.js` 为周期入口，`ai-tags.js` 生成标签。
- `app/automation/scripts/`：`bootstrap-config.ps1` 创建本机占位文件；`self-check.ps1` 检查运行条件；`watchdog.ps1` 运行守护。
- `app/automation/test/`：Node 回归测试；`app/desktop/test-*.ps1` 验证内置 Node、桌面启动器与守护解析。
- `app/.publish-exclude.txt`：完整包必须排除的用户数据目录与私密文件规则。
- `updater/`：包含已发布的 `UpdateAgent.exe`、`enabled.flag` 与 `updater-config.json`。更新器的可重建源码和制包工具链不在本仓库；不能把本机二进制副本当作可维护的更新器源码。
- `TIMEOFF.md`：当前 OSS 自动更新通道、隔离升级/回滚和历史验收记录。

## 环境、开发与测试

开发机：Windows 10/11、Google Chrome、Node.js 24 或兼容版本、.NET Framework C# 编译器。Node 依赖锁定在 `app/automation/package-lock.json`。

```powershell
Set-Location .\app\automation
npm.cmd ci --ignore-scripts
npm.cmd test

Set-Location ..\..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\build-desktop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-bundled-runtime.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-desktop-launchers.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-watchdog-runtime.ps1
```

以上构建会生成 Git 忽略的 `app/DianzhongDesktop.exe` 与 `app/runtime/node/node.exe`。它们必须进入 GitHub Release 完整 ZIP，但不能直接提交进源码。

## 本机配置与安全边界

先运行 `app/automation/scripts/bootstrap-config.ps1`。实际使用者再在本机私密填写：

- `app/企业微信.txt`：企业微信 Webhook。
- `app/飞书接口和链接.txt`：飞书 App ID、App Secret 和表格链接。
- `app/选择资源id.txt`：数字资源 ID。
- `app/违禁词.txt`：违禁词规则。
- `app/DeepSeek接口.txt`：阿里云百炼 API Key；默认模型为 `deepseek-v4-flash-0731`，可选 `qwen3.8-flash`，请求强制 `enable_thinking: false`。
- `app/ChromeProfile/`：仅由实际用户在本机登录创建。

严禁提交或打包真实 TXT/JSON 配置、API Key、Webhook、Cookie、ChromeProfile、`automation/data`、`logs`、`input`、`output`、`failed`、小说目录、队列、备份或 `app.previous`。发布前必须检查 `.gitignore` 和 `.publish-exclude.txt`。

## GitHub Release 完整包

1. 从干净的已测试源码构建桌面 EXE 和内置 Node。
2. 安装 `npm ci --ignore-scripts` 后，将 `app` 及根目录 `Start.cmd`、公开 README/HANDOFF 打入 `dianzhongchushu-<version>-windows-x64.zip`。
3. 严格按 `.publish-exclude.txt` 审计压缩包；确认至少含 `app/DianzhongDesktop.exe`、`app/runtime/node/node.exe`、`app/automation/node_modules`、`app/Start-App.cmd`、根目录 `Start.cmd`。
4. 计算 SHA-256，创建同版本不可变 Git 标签和 GitHub Release，并上传 ZIP 与 `.sha256` 文件；不替换旧 Release 资产。
5. 从 GitHub 下载资产到独立短路径目录，检查 ZIP 条目、哈希和启动所需文件。此步骤不启动自动出书或守护。

GitHub Release 仅提供完整离线包。OSS `latest.json`、`catalog.json`、下载站与 UpdateAgent 的发布是另一个生产流程；除非获得明确授权并完成隔离升级/回滚与公网回读，不要触碰它们。

## 当前状态、已知问题与后续入口

- 已完成：1.1.27 修复完整包遗漏内置 Node 的问题；更新包和完整包的 OSS 发布证据见 `TIMEOFF.md`。
- 发布动作：在 `main` 指向本交接提交后创建不可变标签 `v1.1.27`，并创建同名 GitHub Release，上传匹配的 Windows 完整 ZIP 与 SHA-256 文件；发布后必须下载回读校验。
- 未完成：新电脑的企业微信、飞书、资源 ID、违禁词和 Chrome 登录必须由使用者私密完成；自检失败时不得硬编码或伪造。
- 已知限制：平台扫描与兜底共用 Chrome 持久目录，必须串行；不要删除运行锁来并行化。
- 历史风险：旧提交中曾跟踪 `app/流程记录.md`。当前 `main` 与 Release 包已将其删除并排除，但为遵守“不重写历史”的边界，旧 Git 历史不会在本次发布中被改写；如需清除历史，必须单独作安全决策并通知所有克隆方。
- 排查入口：先执行 `self-check.ps1`；缺少内置 Node 时核对 Release ZIP 的 `app/runtime/node/node.exe`；升级失败只收集不含凭据的版本号、更新器错误和日志摘要。
