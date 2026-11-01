# 点重出书维护交接

交接核对日期：2026-11-01（北京时间）。权威源码仓库为 <https://github.com/nmrsz645-bit/dianzhongchushu>，新电脑克隆 `main`；程序版本为 `app/version.json` 中的 `1.1.27`。GitHub 已有 `v1.1.27` 标签和 Windows 完整包，不能重复发布或覆盖。

新 Windows 电脑接手、GitHub 完整包、客户端自动更新与下载站的分工见 [docs/RELEASE-GUIDE.md](docs/RELEASE-GUIDE.md)。特别注意：推送源码或文档分支不等于客户端更新或网站发布。

## 用途与架构

这是 Windows 本地桌面自动化程序：WinForms 桌面界面负责配置、状态和人工触发；Node.js 自动化负责浏览器扫描、出书、标签、飞书和通知；PowerShell 脚本负责自检、守护和开机自启。程序不会随源码携带用户登录态或业务数据。

```
Start.cmd -> 可选 UpdateAgent --check -> app/Start-App.cmd -> app/DianzhongDesktop.exe
                                     |-> app/runtime/node/node.exe
                                     |-> app/automation/src/*.js
                                     |-> app/automation/scripts/*.ps1
```

根启动器会同步检查 `updater/enabled.flag`；存在时调用同目录 `UpdateAgent.exe --check updater-config.json`，然后才启动应用。直接打开桌面 EXE 或 `app/Start-App.cmd` 会绕过这一更新检查。GitHub 1.1.27 离线完整包不含 updater 目录，因此没有自动更新；已带更新器的 OSS 安装包另行验证。

## 目录与关键模块

- `app/desktop/PointChongDesktop.cs`：WinForms 界面；`build-desktop.ps1` 编译 EXE，并下载/校验内置 Node 24.19.0 x64。
- `app/automation/src/`：Node 业务自动化。`scan-once.js` 为单次扫描入口，`watch-40min.js` 为周期入口，`ai-tags.js` 生成标签。
- `app/automation/scripts/`：`bootstrap-config.ps1` 创建本机占位文件；`self-check.ps1` 检查运行条件；`watchdog.ps1` 运行守护。
- `app/automation/test/`：Node 回归测试；`app/desktop/test-*.ps1` 验证内置 Node、桌面启动器与守护解析。
- `app/.publish-exclude.txt`：完整包必须排除的用户数据目录与私密文件规则。
- `updater/`：包含已发布的 `UpdateAgent.exe`、`enabled.flag` 与 `updater-config.json`。更新器的可重建源码和制包工具链不在本仓库；不能把本机二进制副本当作可维护的更新器源码。
- `TIMEOFF.md`：当前 OSS 自动更新通道、隔离升级/回滚和历史验收记录。

业务链路为“平台扫描/指定书籍 → 内容与推广信息处理 → AI 标签 → 飞书及通知 → 本机状态/文本保存”；外部写入属于真实业务。状态与失败重试入口在 `automation/src/state.js`、`pending-feishu.js`、`scan-once.js`；单本/批量入口为 `run-book.js`、`run-books.js`。修复时先定位模块，保留原数据与可追溯记录，不能清队列来消除报错。

产品约定：模型手动选择，默认 `deepseek-v4-flash-0731`，可选 `qwen3.8-flash`；百炼请求显式 `enable_thinking: false`。标签提示词在 `ai-tags.js` 的 `buildAiTagPrompt`，最多读取正文 6000 字符、输出最多 12 个话题并保留 `#热门小说`。平台扫描和兜底共用 ChromeProfile，必须串行。

## 环境、开发与测试

开发机：Windows 10/11 x64、Google Chrome、Node.js 24 或兼容版本、Windows PowerShell 5.1、.NET Framework C# 编译器。Node 依赖锁定在 `app/automation/package-lock.json`；不依赖 Python 虚拟环境。新电脑完整命令见发布指南第 1 节。

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

上传方法以发布指南第 2、3 节为准：GitHub Release 用已审核版本/提交/ZIP；OSS 用北京地域 bucket `luotuoruanjiangengx` 的本产品路径；下载站是另一仓库 `index.html` 的点重出书静态卡片。安全 manifest 才是当前已安装更新器的实际读取入口；两个历史 catalog 默认保持不动。

## 当前状态、已知问题与后续入口

- 已完成：1.1.27 修复完整包遗漏内置 Node 的问题；更新包和完整包的 OSS 发布证据见 `TIMEOFF.md`。
- 已完成：GitHub `v1.1.27` 关联提交 `fc20f6c52dd7958bdc70724dbe64901a3da9ff4a`；完整 ZIP 为 38,845,618 字节，SHA-256 `2CFE60E0264DB2B88EAB05B72B55C2EB4551A74BD7898A427ED6830A42F78690`。文档后续推进 main，不会改变既有标签和包。
- 既有验证：2026-10-31 同一程序源码通过 19 组 Node 测试、桌面构建、内置 Node/启动器/watchdog 运行时检查及隔离桌面启动烟测；本次只验证文档、对象与命令引用，不重跑业务。
- 缺项：本仓库无更新器原始源码、自动更新包制包器或 OSS 发布脚本；原始工具链未找回。可以重建桌面程序并人工制作离线完整包，不能承诺独立重建/上线新的自动更新包。
- 未完成：新电脑的企业微信、飞书、资源 ID、违禁词和 Chrome 登录必须由使用者私密完成；自检失败时不得硬编码或伪造。
- 已知限制：平台扫描与兜底共用 Chrome 持久目录，必须串行；不要删除运行锁来并行化。
- 历史风险：旧提交中曾跟踪 `app/流程记录.md`。当前 `main` 与 Release 包已将其删除并排除，但为遵守“不重写历史”的边界，旧 Git 历史不会在本次发布中被改写；如需清除历史，必须单独作安全决策并通知所有克隆方。
- 排查入口：先执行 `self-check.ps1`；缺少内置 Node 时核对 Release ZIP 的 `app/runtime/node/node.exe`；升级失败只收集不含凭据的版本号、更新器错误和日志摘要。

## 直接交给另一台电脑 Codex 的指令

> 请接手 https://github.com/nmrsz645-bit/dianzhongchushu 的 main，克隆到 C:\CodexProjects\dianzhongchushu；目录已存在时先只读报告，不覆盖。先完整读 HANDOFF.md、AGENTS.md、docs/RELEASE-GUIDE.md，再读 TIMEOFF.md 顶部当前交接快照。核对 origin、分支、工作区、HEAD 与 origin/main，检查 Git、Node 24、Chrome、PowerShell 和 csc.exe。按指南只创建占位配置、安装锁定依赖、测试和构建，报告具体结果；密钥、飞书/企业微信、资源 ID、Chrome 登录由我在新电脑本地完成。不要从旧电脑复制数据，不启动自动出书/守护，不发布或改生产清单。更新方式按指南区分源码提交、GitHub 完整包、OSS 自动更新与下载站；遇到缺更新器工具链就报告缺项，不能用其他项目替代。完成后报告可维护/可构建/隔离可运行/真实业务未验收的实际范围。
