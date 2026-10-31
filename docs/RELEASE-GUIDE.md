# 点钟出书：新 Windows 电脑接手与发布指南

本指南面向维护者，说明如何在**新电脑**接手源码、验证可运行性，以及在获得单独生产授权后准备客户端更新与下载站更新。它不替代真实生产验收；也不携带、索取或记录任何密钥、Webhook、Cookie、Chrome 登录态、书籍、队列或日志。

当前公开源码版本为 `1.1.27`，权威仓库为 <https://github.com/nmrsz645-bit/dianzhongchushu>。完整离线 Windows 包在同仓库的 [GitHub Releases](https://github.com/nmrsz645-bit/dianzhongchushu/releases/tag/v1.1.27)。

## 先分清四种操作

| 操作 | 正式对象 | 是否会让客户端更新/网站变更 |
| --- | --- | --- |
| 文档分支推送 | `docs/*` 分支 | 不会。仓库工作流只运行 Node 测试，没有部署步骤。 |
| 源码合并 | `main` | 不会。`main` 推送会运行 Node 测试，不会上传 OSS 或修改网站。 |
| GitHub Release | 标签和 Release 资产 | 仅提供完整离线包；不会修改已安装客户端的更新清单。 |
| 客户端更新/下载站发布 | OSS 的更新清单、完整包、catalog 和网站 `main` | 会影响实际用户，必须单独得到生产授权、完成隔离升级/回滚和公网回读。 |

当前 `.github/workflows/test.yml` 只在 `main` 的 push 和 PR 上运行 `npm ci --ignore-scripts`、`npm test`，并且权限为 `contents: read`。没有 GitHub Pages 或 OSS 部署工作流。因此本指南所在的 `docs/*` 分支只用于文档审阅；合并到 `main` 也不会自动发布客户端或网站。

## 1. 新电脑：源码接手与首次验证

### 1.1 前提

- Git：源码接手需要 Git。
- Node.js：源码测试需要 Node.js 24 或兼容版本；当前 CI 使用 Node 24。
- Google Chrome：真实浏览器流程需要它。
- Windows .NET Framework C# 编译器：`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`，用于构建桌面 EXE。

GitHub Release 完整包已内置 Node.js 24.19.0，因此**只运行完整包**时无需另装 Node；从源码验证仍应安装 Node 24。先只读检查：

```powershell
git --version
node --version
Get-Command chrome.exe -ErrorAction SilentlyContinue
Test-Path 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
```

### 1.2 新建干净工作目录

`main` 是正式源码分支；`docs/*` 只是未合并的文档分支，不可当作发布基线。不要复制旧电脑的 `app\ChromeProfile`、根目录 TXT/JSON、`automation\data`、日志、输入输出、队列、小说或 `app.previous`。

```powershell
Set-Location C:\CodexProjects
git clone --branch main https://github.com/nmrsz645-bit/dianzhongchushu.git
Set-Location .\dianzhongchushu
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

工作区应无输出，且 `HEAD` 与 `origin/main` 相同；若不一致，只报告差异，不要重置、覆盖或从旧电脑补文件。

### 1.3 安装、测试、构建与启动

以下命令真实存在于当前源码；它们不启动自动出书或 7x24 守护。

```powershell
Set-Location C:\CodexProjects\dianzhongchushu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\automation\scripts\bootstrap-config.ps1

Set-Location .\app\automation
npm.cmd ci --ignore-scripts
npm.cmd test

Set-Location ..\..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\automation\scripts\self-check.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\build-desktop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-bundled-runtime.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-desktop-launchers.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\app\desktop\test-watchdog-runtime.ps1
```

`build-desktop.ps1` 下载并校验 Node.js 24.19.0 x64，生成被 Git 忽略的 `app\DianzhongDesktop.exe` 与 `app\runtime\node\node.exe`。桌面入口为根目录 `Start.cmd` 或 `app\Start-App.cmd`；不需要为了本阶段启动业务自动化。

首次自检前，使用者必须在**本机私密**填写/登录：`app\企业微信.txt`、`app\飞书接口和链接.txt`、`app\选择资源id.txt`、`app\违禁词.txt`、`app\DeepSeek接口.txt`，并通过 `app\打开登录页面.bat` 在 `app\ChromeProfile` 完成登录。占位配置或缺少 ChromeProfile 时自检报错是预期安全行为，不能伪造内容让它通过。

### 1.4 本机迁移的边界

已安装客户端更新时，`Start.cmd` 会在存在 `updater\enabled.flag` 时调用 `updater\UpdateAgent.exe --check updater\updater-config.json`。`updater\updater-config.json` 的 `preservePaths` 指定了本机需保留的配置与运行数据；更新器产生的同机 `app.previous` 可由 `app\Migrate-PreviousUserData.ps1` 仅在本机恢复部分旧数据。

这不是跨电脑迁移工具：不要复制 `app.previous`、ChromeProfile、浏览器 Cookie 或任何受 Windows/DPAPI 保护的登录资料到新电脑。新电脑应分别登录并配置；复制后即使文件存在，也不能证明凭据可用或安全。

## 2. 版本、完整包与 GitHub Release

### 2.1 版本唯一来源

源码版本只在 `app\version.json` 的 `version` 字段修改。目录名、EXE 修改时间、ZIP 文件名和 Git 标签都不是版本真相；发布时它们必须与该字段一致。

```powershell
Get-Content -Raw .\app\version.json
Get-FileHash -Algorithm SHA256 -LiteralPath .\dianzhongchushu-<version>-windows-x64.zip
```

### 2.2 完整离线包

当前仓库**没有受版本控制的完整包制作脚本**。完整包必须从干净、已测试的构建目录制作，压缩前逐项按 `app\.publish-exclude.txt` 审计。至少需要：

- 根目录 `Start.cmd`、公开的 `README.md`、`HANDOFF.md`、本指南；
- `app\DianzhongDesktop.exe`、`app\Start-App.cmd`、`app\runtime\node\node.exe`；
- `app\automation\node_modules` 及与源码匹配的 `app` 文件。

禁止进入包内的内容包括配置 TXT/JSON、`ChromeProfile`、`automation\data`、`logs`、`input`、`output`、`failed`、小说目录、队列、备份和 `app.previous`。使用独立短路径的临时 staging 目录；对最终 ZIP 计算 SHA-256，并在上传 GitHub Release 前后都校验。不要覆盖既有标签或 Release 资产；新版本必须使用新版本号和新标签。

GitHub Release 的完整包不等于可自动升级的安装包：发布完整包可不携带更新器，根 `Start.cmd` 在没有 `updater\enabled.flag` 时会直接启动应用。GitHub Release 的上传需要单独的 GitHub 发布权限；不要把 token 写进命令历史、文档或仓库。

### 2.3 增量更新包：本仓库无法独立重建

增量更新依赖已跟踪的 `updater\UpdateAgent.exe` 和 `updater\updater-config.json`，但**本仓库不含更新器源码、增量包生成脚本或经过审计的更新器构建工具链**。因此不得根据猜测生成 `app.zip`、替换 UpdateAgent，或直接修改线上清单。

仅在取得经审计的外部更新器工具链、明确生产授权和隔离验证环境后，才允许走以下顺序：

1. 从干净源码构建并制作候选 `app.zip`，对包和每个稳定程序文件计算 SHA-256。
2. 在隔离的旧版本安装目录执行真实更新与回滚；对 `preservePaths` 中的本机数据做哈希前后对比。
3. 上传不可变的版本化更新对象后，写入两个 manifest，最后才切换 catalog 和网站卡片。
4. 通过公网 HTTPS 下载回读、哈希、版本和隔离升级检查后，才宣布发布完成。

当前实际客户端配置读取安全 manifest：

`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu-safe/latest.json`

2026-10-31 只读核对显示，它与主 manifest

`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu/latest.json`

均为 `1.1.27`，并有相同字段：`version`、`url`、`sha256`、`notes`、`files`。实际安全 manifest 的 `url` 指向版本化对象 `updates/dian-zhong-chu-shu/1.1.27-r1/app.zip`。后续版本应先只读读取当前 manifest 的完整 JSON，并使用更新器工具链要求的确切字段；不可由本指南推断或简化 schema。

## 3. OSS、下载站与实际映射

这一节只记录已验证的对象关系，**不提供上传命令**；本次文档提交不执行 OSS 上传、manifest/catalog 修改、网站部署或站点仓库写入。

### 3.1 客户端更新面

| 对象 | 现状与用途 |
| --- | --- |
| `updates/dian-zhong-chu-shu-safe/latest.json` | `updater-config.json` 实际引用的安全 manifest。 |
| `updates/dian-zhong-chu-shu/latest.json` | 同版本的主 manifest；历史发布也同步维护。 |
| `updates/dian-zhong-chu-shu/<版本>-rN/app.zip` | manifest 的版本化增量应用包。 |
| 根 `catalog.json` | 外部 OSS JSON，不在源码/网站仓库；当前点钟条目为 `dian-zhong-chu-shu`。 |
| `downloads/catalog.json` | 外部 OSS JSON；历史发布同步维护。 |

当前两个 catalog 的点钟条目字段为 `id`、`name`、`description`、`version`、`visible`、`downloadUrl`；当前值是 `id: dian-zhong-chu-shu`、`version: 1.1.27`、`downloadUrl: packages/dian-zhong-chu-shu-1.1.27.zip`。这两个 JSON 不在本仓库，且没有本仓库内的 catalog 上传脚本。

### 3.2 下载站面

下载站仓库为 <https://github.com/nmrsz645-bit/software-download-center>，GitHub Pages 当前从 `main` 根目录发布。该仓库当前只有 `index.html`、`CNAME` 及与其他产品有关的两份 manifest；它不保存上述 OSS catalog，也没有点钟出书的 catalog 发布脚本。

点钟出书当前是 `index.html` 中的**静态卡片**：没有 DOM `id`，卡片文案/版本和下载锚点都直接写在该文件，下载 URL 当前为 `https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/packages/dian-zhong-chu-shu-1.1.27.zip`。网站的运行时 JavaScript 没有读取点钟出书 manifest；因此更新网站时必须同时核对静态版本文案和静态 URL，不能期待它自动从更新 manifest 刷新。

通用网站发布指南由专门更新会话维护：<https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#website>、[#catalog](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#catalog)、[#client-update](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#client-update)、[#verify-rollback](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#verify-rollback)、[#credentials](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#credentials)。2026-10-31 的只读检查时该分支尚不可读取；在它可读并经维护者确认前，仍以本节的点钟专属映射为准，且不要写网站仓库。

## 4. 发布后验收与回滚

在得到生产授权后，验收顺序如下；任何一步失败都应停止在当前版本化对象，不要覆盖用户安装目录：

1. 下载完整包与增量包，重新计算 SHA-256；完整包还要检查 `DianzhongDesktop.exe`、`runtime\node\node.exe`、`Start-App.cmd` 和依赖是否存在。
2. 读取主/安全 manifest，确认 `version`、`url`、`sha256` 与下载文件一致，且 `files` 完整性清单对应候选包。
3. 在短路径、非生产的旧版本副本中，从根 `Start.cmd` 运行真实升级；比较 `preservePaths` 内数据的更新前后哈希。
4. 在同一隔离副本使用**已审计的外部更新器工具链**执行其已验证的回滚流程，再核验版本、Node 运行时和用户数据。仓库没有可安全引用的 `RollbackApp()` 命令行入口，不能编造命令。
5. 访问下载站，核对静态卡片的版本、下载 URL 和实际下载包；GitHub Release、OSS 完整包和客户端 manifest 是三条独立链路，必须分别证明。

可行回滚前提是保留既有版本化对象和上一份已验证 manifest。发生问题时，在获得生产授权后将主/安全 manifest 与两个 catalog/静态网站链接恢复到上一份**已验证**版本；不要删除新对象、覆盖用户资料或以 Git push 代替回滚验证。

## 5. 权限与凭据

- GitHub：源码/Release 权限与下载站仓库权限应通过新电脑上的已授权 GitHub 登录或组织认可的安全渠道取得；不在仓库写 token。
- OSS：本项目源码没有 OSS 凭据文件、上传配置名或发布脚本。只能从组织批准的安全凭据管理渠道在本机取得临时权限；不得把 access key、session token、Webhook 或 API Key 写入文档、Git、ZIP、日志或聊天。
- 应用配置：企业微信、飞书、资源 ID、模型 API Key 和 Chrome 登录只由实际使用者在新电脑本地填写/登录。它们不是发布素材，也不能从旧电脑导入。

## 6. 本轮范围与缺项

本轮只更新交接文档和公开链接：未修改功能、版本、程序包、GitHub Release/tag、OSS 对象、catalog、下载站或另一台电脑。对增量更新包的重新制作、OSS 上传和实际回滚，仍缺少本仓库外的更新器源码/构建工具链与经授权的生产凭据；这些必须另行授权和验证。
