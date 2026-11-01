# 点钟出书：新 Windows 电脑接手与发布指南

本指南面向维护者，说明如何在**新电脑**接手源码、验证可运行性，以及在获得单独生产授权后准备客户端更新与下载站更新。它不替代真实生产验收；也不携带、索取或记录任何密钥、Webhook、Cookie、Chrome 登录态、书籍、队列或日志。

交接核对日期：2026-11-01（北京时间）。当前公开源码版本为 `1.1.27`，权威仓库为 <https://github.com/nmrsz645-bit/dianzhongchushu>，正式分支为 `main`。完整离线 Windows 包在同仓库的 [GitHub Releases](https://github.com/nmrsz645-bit/dianzhongchushu/releases/tag/v1.1.27)。

## 先分清四种操作

| 操作 | 正式对象 | 是否会让客户端更新/网站变更 |
| --- | --- | --- |
| 文档分支推送 | `docs/*` 分支 | 不会。仓库工作流只运行 Node 测试，没有部署步骤。 |
| 源码合并 | `main` | 不会。`main` 推送会运行 Node 测试，不会上传 OSS 或修改网站。 |
| GitHub Release | 标签和 Release 资产 | 仅提供完整离线包；不会修改已安装客户端的更新清单。 |
| 客户端更新/下载站发布 | OSS 的版本包、客户端更新清单和网站 `main`；历史 catalog 仅在确认读取方时涉及 | 会影响实际用户，必须单独得到生产授权、完成隔离升级/回滚和公网回读。 |

当前 `.github/workflows/test.yml` 只在 `main` 的 push 和 PR 上运行 `npm ci --ignore-scripts`、`npm test`，并且权限为 `contents: read`。没有 GitHub Pages 或 OSS 部署工作流。新电脑以 `main` 中的本指南为准；`docs/*` 是工作分支命名，合入 `main` 也不会自动发布客户端或网站。

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
Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Test-Path 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
Test-Path 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
powershell.exe -NoProfile -Command '$PSVersionTable.PSVersion'
```

Chrome 通常不在 PATH；`Get-Command` 无输出时还要看安装路径。缺少依赖时使用 Git/Node/Chrome 官方安装器；当前构建固定下载 Node 24.19.0，并校验脚本内 SHA-256。GitHub CLI 仅供维护者管理 Release/PR，可通过 `gh auth login` 在新电脑浏览器交互登录，不发送 token 到聊天。

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

若 `C:\CodexProjects` 尚不存在，先用 `New-Item -ItemType Directory -Path C:\CodexProjects` 创建；若项目目录已经存在，停止 clone 并只读检查原目录。新电脑不需要本机历史隔离目录。要固定复现旧程序源码，可另克隆并检出 `v1.1.27`；一般维护用 `main`。

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

维护程序时先在仓库根 `git status --short` 核对改动，再从已确认的 `main` 建立 `codex/<具体任务名>` 工作分支。按 `AGENTS.md` 完成对应测试，明确暂存本次源文件；不要 `git add .`。例如：

```powershell
git diff --check
git diff --stat
git add -- '<本次实际修改的源文件路径>'     # 逐项写真实路径，不能提交配置/运行数据
git diff --cached --name-only
git commit -m '<本次修改说明>'
git push -u origin '<当前工作分支名>'
gh pr create --repo nmrsz645-bit/dianzhongchushu --base main --head '<当前工作分支名>' --title '<修改标题>' --body '<变更和验证结果>'
```

PR 审阅通过后按授权合入 `main`。源码提交、程序包上传和客户端清单切换分别验收；只推源码不等于已给客户更新。

### 2.1 版本唯一来源

源码版本只在 `app\version.json` 的 `version` 字段修改；`app/automation/package.json` 的 `1.0.0` 是内部 npm 包信息，不是桌面发布号。目录名、EXE 修改时间、ZIP 文件名和 Git 标签都不是版本真相；发布时它们必须与该字段一致。本轮不改版本；未来经授权的新程序版本必须使用新的版本号。

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

#### 人工完整离线包的具体制作办法

以下是供下一次获批制包时使用的 PowerShell 示例，本次交接未执行。只能在**新建、干净、已审核提交**的源码目录先运行 `npm.cmd ci --ignore-scripts`、测试和桌面构建；不能在用户安装目录执行。`git archive` 只导出已提交内容，然后补入刚构建的 EXE、固定 Node 和锁定依赖；当前完整离线包故意不包含 updater/reporter 目录。上传前仍须按发布排除规则逐项审计，特别是将来新增的已跟踪文件。

```powershell
$ErrorActionPreference = 'Stop'
$src = (Get-Location).Path                    # 当前为已审核的仓库根
if (git status --porcelain) { throw '工作区有改动，先核对来源' }
$version = (Get-Content -Raw .\app\version.json | ConvertFrom-Json).version
$out = Join-Path 'C:\CodexProjects' ('dianzhong-package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $out | Out-Null
$name = 'dianzhongchushu-' + $version + '-windows-x64'
$stage = Join-Path $out $name
$sourceZip = Join-Path $out 'source-only.zip'
git archive --format=zip --output=$sourceZip HEAD Start.cmd README.md HANDOFF.md AGENTS.md TIMEOFF.md docs app
if ($LASTEXITCODE -ne 0) { throw '源码导出失败' }
Expand-Archive -LiteralPath $sourceZip -DestinationPath $stage
Copy-Item -LiteralPath (Join-Path $src 'app\DianzhongDesktop.exe') -Destination (Join-Path $stage 'app')
Copy-Item -LiteralPath (Join-Path $src 'app\runtime') -Destination (Join-Path $stage 'app') -Recurse
Copy-Item -LiteralPath (Join-Path $src 'app\automation\node_modules') -Destination (Join-Path $stage 'app\automation') -Recurse
$zip = Join-Path $out ($name + '.zip')
Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
Set-Content -LiteralPath ($zip + '.sha256') -Value ($hash + '  ' + $name + '.zip') -Encoding Ascii
git rev-parse HEAD
Get-Item -LiteralPath $zip | Select-Object Name,Length
$hash
```

检查 ZIP 顶层为单一版本目录，内部包含第 2.2 节关键路径；检查 `app/version.json` 与目标版本一致、`runtime/node/node.exe` 哈希与 `build-desktop.ps1` 固定值一致。检查所有条目无用户数据，并从 ZIP 内抽查文件内容；仅靠文件名排除不能替代内容审计。这是完整离线包示例，不能把该 ZIP 改名成 `app.zip` 给自动更新器。

#### GitHub 上传方式

源码交接先推独立分支并审阅 PR；程序 Release 则在**另获发布授权、全新版本和包验收完成**后进行。下列命令只记录未来操作，未在本轮执行；`v1.1.27` 已存在，绝不能重建/覆盖。

```powershell
# $version、$zip 来自上述经审计的候选包；$approvedCommit 必须是审核通过的远端 main 提交
$approvedCommit = '<审核通过的完整提交SHA>'
$tag = 'v' + $version
# 先 gh release view $tag --repo nmrsz645-bit/dianzhongchushu、git ls-remote --tags origin 检查不存在
git tag -a $tag $approvedCommit -m ('点钟出书 ' + $version)
git push origin ('refs/tags/' + $tag)
gh release create $tag $zip ($zip + '.sha256') --repo nmrsz645-bit/dianzhongchushu --verify-tag --title ('点钟出书 ' + $version) --notes '完整离线Windows包；使用前在本机配置并登录。'
```

任一命令失败立即停止。发布后 `gh release view $tag --repo nmrsz645-bit/dianzhongchushu --json assets,url`，再用 `gh release download $tag --repo nmrsz645-bit/dianzhongchushu --dir <新建回读目录>` 下载核对哈希。源码 main、标签和包必须记录对应关系；文档更新不需要新标签或重发程序包。

### 2.3 自动更新包与更新器：尚缺已验证的发布工具链

客户端的应用更新包通常称 `app.zip`（完整应用载荷，不代表二进制差分补丁）。当前更新依赖已跟踪的 `updater\UpdateAgent.exe` 和 `updater\updater-config.json`，但**本仓库不含更新器源码、自动更新制包脚本或经过审计的更新器构建工具链**。普通 ZIP 压缩本身可以完成；缺的是固定布局、保留数据/完整性过滤与真实更新器兼容性的一套可复现发布验收。不得凭猜测上线候选 `app.zip`、替换 UpdateAgent或修改线上清单。

仅在取得经审计的外部更新器工具链、明确生产授权和隔离验证环境后，才允许走以下顺序：

1. 从干净源码构建并制作候选 `app.zip`，对包和每个稳定程序文件计算 SHA-256。
2. 在隔离的旧版本安装目录执行真实更新与回滚；对 `preservePaths` 中的本机数据做哈希前后对比。
3. 上传不可变的版本化更新对象，并从公网回下载确认哈希；在这之前不改任何客户端 manifest。
4. 最后才按经验证的现有 schema 切换主/安全 manifest，确保实际客户端入口指向已回读的版本化对象。
5. `catalog.json` 与 `downloads/catalog.json` 不是默认发布步骤：只有先确认仍存在的具体读取方、兼容字段和单独发布授权时才同步；当前下载站不读取它们。
6. 下载站当前仅需按其实际 `index.html` 静态卡片/元数据更新；不因历史 catalog 存在而修改它。
7. 通过公网 HTTPS 下载回读、哈希、版本和隔离升级检查后，才宣布发布完成。

当前实际客户端配置读取安全 manifest：

`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu-safe/latest.json`

2026-11-01 只读核对显示，它与主 manifest

`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu/latest.json`

均为 `1.1.27`，并有相同字段：`version`、`url`、`sha256`、`notes`、`files`。实际安全 manifest 的 `url` 指向版本化对象 `updates/dian-zhong-chu-shu/1.1.27-r1/app.zip`。后续版本应先只读读取当前 manifest 的完整 JSON，并使用更新器工具链要求的确切字段；不可由本指南推断或简化 schema。

### 2.4 工具链找回审计（2026-10-31）

本机有可恢复的**完整离线包**能力，但没有可重建的**增量更新器/增量制包器**：

- `app\desktop\build-desktop.ps1` 是已跟踪的桌面构建脚本：编译 `PointChongDesktop.cs`，下载并校验 Node.js 24.19.0 x64，再写入 `app\DianzhongDesktop.exe` 与 `app\runtime\node\node.exe`。
- 仓库已跟踪 `updater\UpdateAgent.exe`、`updater\enabled.flag` 和 `updater\updater-config.json`。这只能说明已发布二进制可由启动器调用，不提供其 C#/项目文件、增量包生成脚本或 manifest 写入工具。
- 对全部可见 Git refs 的 `updater/` 路径名和历史提交进行了只读检查；只发现上述二进制、开关和配置，未发现 `.cs`、`.csproj`、`.sln`、更新器 `build`、`pack` 或 `publish` 源文件。
- 2026-10-31 对明确相关的外部更新器目录和配置远端进行只读审计，结果为空仓库；未找回更新器原始源码归档。此缺口不能通过复制二进制或另一个产品的更新器填补。
- 历史 `dianzhong-v1127-*` 目录保存候选 ZIP、安装包或更新器二进制，不能当作源代码或安全重新发布素材；本指南不打开、不重打包这些历史候选。

离线可复核的完整包基线为 GitHub `v1.1.27` 的 Windows ZIP：2026-10-31 已验证 204 个条目、根 `Start.cmd`、桌面 EXE、`Start-App.cmd`、内置 Node 与已安装依赖均存在，SHA-256 为 `2CFE60E0264DB2B88EAB05B72B55C2EB4551A74BD7898A427ED6830A42F78690`，且敏感/运行数据路径命中为零。使用同一哈希在内存构造并 JSON 往返验证过 `version`、`url`、`sha256`、`notes`、`files` 五个 manifest 字段；这是**格式检查**，不是 UpdateAgent 对新 manifest 或新 `app.zip` 的接受测试。

结论：桌面程序及完整离线包可在干净环境按本指南重新构建、审计和校验；增量更新包、UpdateAgent 重建和对新 manifest 的端到端接受测试仍缺原始更新器源码/构建工具链。不得用其他项目的更新器、历史 ZIP 或合成 manifest 替代。

## 3. OSS、下载站与实际映射

这一节记录本产品实际对象和下一次获批发布时的上传方法；本次文档交接只推源码仓库文档，下面的生产上传/清单切换/网站命令均未执行。

### 3.1 客户端更新面

| 对象 | 现状与用途 |
| --- | --- |
| `updates/dian-zhong-chu-shu-safe/latest.json` | `updater-config.json` 实际引用的安全 manifest。 |
| `updates/dian-zhong-chu-shu/latest.json` | 同版本的主 manifest；历史发布曾同步维护，但实际客户端配置当前读取的是安全 manifest。 |
| `updates/dian-zhong-chu-shu/<版本>-rN/app.zip` | manifest 的版本化增量应用包。 |
| 根 `catalog.json` | 外部 OSS JSON，不在源码/网站仓库；当前含点钟条目 `dian-zhong-chu-shu`，但当前网站无读取。 |
| `downloads/catalog.json` | 外部 OSS JSON；同样是历史对象，未确认读取方前不得作为默认发布步骤。 |

当前两个 catalog 的点钟条目字段为 `id`、`name`、`description`、`version`、`visible`、`downloadUrl`；当前值是 `id: dian-zhong-chu-shu`、`version: 1.1.27`、`downloadUrl: packages/dian-zhong-chu-shu-1.1.27.zip`。这两个 JSON 不在本仓库，且没有本仓库内的 catalog 上传脚本；在确认具体消费者之前，保留只读记录即可。

#### OSS 手工上传：对象、顺序和回读

使用获授权操作者的新电脑 OSS 控制台登录，选择**北京地域、bucket `luotuoruanjiangengx`**（endpoint `oss-cn-beijing.aliyuncs.com`）。本项目没有可调用的 `publish-oss.ps1` 等上传脚本；这里采用控制台“文件管理 / 上传文件”。生产上传需要用户单独授权和候选包验收；只有完整离线包获批时，只上传完整包及校验文件，不切客户端 manifest。

| 用途 | 目标 object key（不含 bucket/开头斜杠） | 写入时机 |
| --- | --- | --- |
| 新用户完整包 | `packages/dian-zhong-chu-shu-<新版本>.zip` | 首先写入全新 key，附带 `.sha256` 校验文件；不覆盖 1.1.27。 |
| 已安装客户端应用更新包 | `updates/dian-zhong-chu-shu/<新版本>-r1/app.zip` | 仅兼容验收完成后写入新的版本化 key。 |
| 主 manifest | `updates/dian-zhong-chu-shu/latest.json` | 两种包公网回读、旧版隔离升级/回滚完成后切换。 |
| 实际客户端读取的安全 manifest | `updates/dian-zhong-chu-shu-safe/latest.json` | 同一发布最后切换；仅改主 manifest 不会让当前配置的客户端发现更新。 |

完整包和应用更新包是不同文件，不能混用哈希。历史 `downloads/packages/` 镜像只有确认仍有读取方时才维护，不是当前静态网站的下载入口。不要更改 bucket 权限、域名或旧对象；上传时核对完整 key，而不是只核对文件名。

1. 上传前保存两份当前 manifest 的原始内容、旧 URL/哈希和网页旧提交，作为回滚资料；不把这些备份和用户配置混入 ZIP。
2. 在 OSS 控制台对应版本目录上传审核后的 ZIP 和校验文件。确认对象路径和字节数；旧版本保持原样。
3. 从公网重新下载，逐一比对字节数和 SHA-256。下面是只读验证示例，使用新建目录；未来完整包/应用包各执行一次，绝不把完整包 URL 填进客户端的 `url` 字段。

```powershell
$verifyDir = Join-Path 'C:\CodexProjects' ('dianzhong-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verifyDir | Out-Null
$candidateUrl = '<本次获批ZIP的完整HTTPS地址>'
$expectedSha256 = '<本地候选记录的64位SHA256>'
$downloaded = Join-Path $verifyDir 'downloaded.zip'
Invoke-WebRequest -UseBasicParsing -Uri $candidateUrl -OutFile $downloaded
$actual = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash
if ($actual -ne $expectedSha256) { throw '公网哈希与候选不一致，停止发布' }
Get-Item -LiteralPath $downloaded | Select-Object Length
```

4. 只有自动更新工具链及旧版隔离验收具备时，上传候选 `latest.json` 到主/安全两个精确 key。字段语义：`version` 是目标程序版本；`url` 是 **app-only** 版本化载荷 URL；`sha256` 是该载荷哈希；`notes` 是公开变更摘要；`files` 是稳定应用文件的相对路径到 SHA-256 的映射。路径以应用根为基准，历史清单使用反斜杠；必须沿用已验证解析规则，不能自行增加 `app/` 前缀。
5. `files` 不应将更新器要保留的本地配置与稳定程序文件混为一谈；历史 1.1.27 载荷有 197 个文件，清单为 188 项，差异来自保留规则。不能把任意本地目录的全文件哈希直接当生产 manifest。新的清单必须由对应工具链生成并经真实 UpdateAgent 验证。
6. 分别重新 GET 两份 HTTPS manifest，确认版本、载荷 URL 和哈希正确；必要时用查询参数排除缓存。再进行客户端启动器隔离验证，最后才更新网页入口。任一阶段失败，按第 4 节恢复已经变更过的指针。

### 3.2 下载站面

下载站仓库为 <https://github.com/nmrsz645-bit/software-download-center>，GitHub Pages 当前从 `main` 根目录发布。该仓库当前只有 `index.html`、`CNAME` 及与其他产品有关的两份 manifest；它不保存上述 OSS catalog，也没有点钟出书的 catalog 发布脚本。

点钟出书当前是 `index.html` 中的**静态卡片**：没有 DOM `id`，卡片文案/版本和下载锚点都直接写在该文件，下载 URL 当前为 `https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/packages/dian-zhong-chu-shu-1.1.27.zip`。网站的运行时 JavaScript 没有读取点钟出书 manifest 或历史 catalog；因此更新网站时只核对静态版本文案、静态 URL 和实际下载包，不能期待自动刷新，也不能因为 catalog 存在而改它。

通用网站发布指南由专门更新会话维护：<https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#website>、[#catalog](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#catalog)、[#client-update](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#client-update)、[#verify-rollback](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#verify-rollback)、[#credentials](https://github.com/nmrsz645-bit/software-download-center/blob/docs-cross-pc-handoff/docs/PUBLISHING.md#credentials)。2026-10-31 已只读确认该分支和五个锚点可访问；它仍由专门更新会话维护。本节保留点钟专属对象与缺项，且不授权在本项目会话写网站仓库。

#### 点钟下载卡片的具体发布步骤

只有获得本次网页发布授权的维护者/更新会话执行；本次文档交接没有操作网站仓库。新电脑可单独克隆网站仓库；已有目录时先核对未提交改动，再普通快进整合，不能覆盖。进入**网站仓库**后：

```powershell
git fetch origin main
git status --short
git branch --show-current                 # 应为 main；有改动或不在 main 时先停下核对
git merge --ff-only origin/main           # 只在工作区干净且确认是网站 main 时执行
git rev-parse HEAD                        # 记录网站改动前 SHA
```

在 `index.html` 定位 `<h3>点重出书</h3>` 对应的一个 `<article>`，同时修改 `.meta` 中的显示版本、`a.download` 的 HTTPS `href` 和按钮版本文字。链接指向已经公网回读的完整包，不能指向 `app.zip`。本产品无动态 manifest 加载器，因此不添加/修改别的产品 JSON，不改 CNAME。审核 diff 后：

```powershell
git diff --check
git diff -- index.html
git add -- index.html
git diff --cached --name-only             # 本次应只含 index.html
git commit -m '更新点钟出书完整包下载信息'
git push origin main
gh api repos/nmrsz645-bit/software-download-center/pages/builds/latest --jq '{status,commit}'
```

Pages 构建完成后，用带随机查询参数的 <https://download.luotuoqiluotuozhaoma.com/> 回读页面并点击点重出书下载链接，核对实际 ZIP 哈希。只推网站 Git 提交但未验证 Pages、页面与实际下载，不能报告网站发布完成。

## 4. 发布后验收与回滚

在得到生产授权后，验收顺序如下；任何一步失败都应停止在当前版本化对象，不要覆盖用户安装目录：

1. 下载完整包与增量包，重新计算 SHA-256；完整包还要检查 `DianzhongDesktop.exe`、`runtime\node\node.exe`、`Start-App.cmd` 和依赖是否存在。
2. 读取主/安全 manifest，确认 `version`、`url`、`sha256` 与下载文件一致，且 `files` 完整性清单对应候选包。
3. 在短路径、非生产的旧版本副本中，从根 `Start.cmd` 运行真实升级；比较 `preservePaths` 内数据的更新前后哈希。
4. 在同一隔离副本使用**已审计的外部更新器工具链**执行其已验证的回滚流程，再核验版本、Node 运行时和用户数据。仓库没有可安全引用的 `RollbackApp()` 命令行入口，不能编造命令。
5. 访问下载站，核对静态卡片的版本、下载 URL 和实际下载包；GitHub Release、OSS 完整包和客户端 manifest 是三条独立链路，必须分别证明。

可行回滚前提是保留既有版本化对象和上一份已验证 manifest。发生问题时，在获得生产授权后将主/安全 manifest 恢复到上一份**已验证**版本；静态网站链接只在本次确实已修改时恢复。两个历史 catalog 只有在本次已确认读取方并被明确修改时才随之恢复；不要删除新对象、覆盖用户资料或以 Git push 代替回滚验证。

## 5. 权限与凭据

- GitHub：源码/Release 权限与下载站仓库权限应通过新电脑上的已授权 GitHub 登录或组织认可的安全渠道取得；不在仓库写 token。
- OSS：本项目源码没有 OSS 凭据文件、上传配置名或发布脚本。只能从组织批准的安全凭据管理渠道在本机取得临时权限；不得把 access key、session token、Webhook 或 API Key 写入文档、Git、ZIP、日志或聊天。
- 应用配置：企业微信、飞书、资源 ID、模型 API Key 和 Chrome 登录只由实际使用者在新电脑本地填写/登录。它们不是发布素材，也不能从旧电脑导入。

## 6. 本轮范围与缺项

本轮只更新交接文档和公开链接：未修改功能、版本、程序包、GitHub Release/tag、OSS 对象、catalog、下载站或另一台电脑。对增量更新包的重新制作、OSS 上传和实际回滚，仍缺少本仓库外的更新器源码/构建工具链与经授权的生产凭据；这些必须另行授权和验证。

新电脑优先完成：读取交接入口 → 核对源码/依赖 → 配置占位 → 无凭据测试/桌面构建 → 私密本机配置及登录 → 单独授权的业务验收。已有自检/历史模型请求/旧版升级记录不能代替新电脑实际结果。
