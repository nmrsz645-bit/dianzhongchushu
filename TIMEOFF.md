# 点重自动化交接说明

更新时间：2026-08-21 03:52（北京时间）

## 0. 本次续作结论（2026-08-21 03:52）

已按上一版“下一步”完成队列日期修复、本地验证、正式制包、真实升级/回滚和线上发布。当前权威源码与线上版本均为 `1.1.25`。

本次只修改了 4 个根因相关文件：

- `app\automation\src\state.js`
- `app\automation\src\status-utils.js`
- `app\automation\test\state.test.js`
- `app\automation\test\status-utils.test.js`

修复结果：

1. `readFailedQueue()` 不再把旧日期彻底失败记录恢复到活动队列。
2. 已增加只迁移“明确早于北京时间今天”的旧活动记录的幂等迁移；保留原字段，同一 ID 不新增重复彻底失败记录。
3. 状态统计按“成功记录 > 今日活动任务 > 旧彻底失败记录”去重。
4. 今日主任务、今日兜底失败任务仍可重试；同一 ID 的今日兜底任务会压过旧平台失败，界面只计入重试一次。
5. 对另一台电脑快照的离线结果为：重试 `73`、彻底失败 `407`；源快照哈希前后不变。

本次验证已通过：

- 两个定向测试先在旧实现上按预期失败，修复后通过。
- `npm.cmd test` 全部通过。
- `scripts\self-check.ps1` 全部通过。
- 隔离数据实际调用 `readFailedQueue()`：旧版错误恢复后的活动 `417` 本被恢复为活动 `6`、彻底失败 `411`；第二次读取文件哈希不变。
- 真实 Chrome 登录态只读访问推广列表成功：首屏 10 条、北京时间当天 6 条、变更动作 0，未调用出书流程。
- 桌面 EXE 在项目外隔离构建并成功打开；隔离状态文件显示重试 73、彻底失败 407，可访问性树确认统计区和彻底失败详情入口存在。Windows 截图接口对该 WinForms 窗口返回不支持，因此没有伪造截图证据。
- 更新器 `UpdateTransaction` 官方事务测试全部通过，覆盖 ChromeProfile、配置、队列/日志/输入输出/失败目录、小说目录、通配 TXT/根 JSON、`app.previous` 和回滚。

用户明确回复“更新吧”后已执行发布动作。主更新入口、安全更新入口、根 `catalog.json` 和 `downloads/catalog.json` 均已激活并经独立 HTTPS 回读为 `1.1.25`；更新任务会话 `019fdfd3-80e4-7622-9be9-7867bad946a5` 已收到完成通知。

当前文件 SHA-256：

- `state.js`：`6D5DB30A767318263DC96F13937ED4F774E9F6DB2DA717A8459CFA79BA64FC71`
- `status-utils.js`：`B381B6686A381EAC6D3762636661CAC4410DE675CB34FC71926E1210BDB4C723`
- `state.test.js`：`E26D4EAB73656C5A6ED01E5FDFA3976D045AD3A5B2DA36864BBBC5FD64FE460A`
- `status-utils.test.js`：`4BF74463165F22C6D30343866317EF1D5B43C6ECA7DDE4FDE8AEA6278C4F0C1C`
- 原 `DianzhongDesktop.exe` 未覆盖，仍为：`9862421D4B1B0834009D513A91370515EEAA6F294D0200445E9AA7F84049425B`
- `version.json` 已递增到 `1.1.25`，SHA-256：`D1EBB4DEF3EEF11F4A3FFEA4F5E50D65827F074496717C6F1EC63A037A487A6F`

项目外备份和隔离验证材料：`E:\自动化\gengxin\_codex-backups\dian-zhong-20260821-queue-date-fix`

## 1. 当前目标

修复原版本 `1.1.24` 的队列日期判定，并以 `1.1.25` 正式发布，使程序严格遵守以下业务规则：

1. 平台扫描和兜底都只处理“北京时间今天”的书。
2. 旧日期书籍不再恢复到重试队列，直接保留/进入彻底失败队列。
3. 重试队列只统计仍可继续处理的当日任务。
4. 同一个书籍 ID 不重复统计。
5. 如果同一 ID 既有旧平台失败记录，又在今天的兜底表格出现，则今天的兜底任务可以继续重试；界面不能同时把它计入重试和彻底失败。
6. 修复必须兼容已有用户数据，不能清空、重建或覆盖真实队列。

本次续作已完成源码修复、本地/隔离验证、版本递增和正式发布。

## 2. 当前权威源码与版本

- 项目根目录：`E:\自动化\gengxin\dian-zhong-chu-shu`
- 当前应用源码：`E:\自动化\gengxin\dian-zhong-chu-shu\app`
- 自动化源码：`E:\自动化\gengxin\dian-zhong-chu-shu\app\automation`
- 兜底源码：`E:\自动化\gengxin\dian-zhong-chu-shu\app\兜底`
- 桌面控制台源码：`E:\自动化\gengxin\dian-zhong-chu-shu\app\desktop\PointChongDesktop.cs`
- 当前版本文件：`E:\自动化\gengxin\dian-zhong-chu-shu\app\version.json`
- 当前版本：`1.1.25`
- 该目录不是 Git 仓库，不能依赖 `git status`/`git diff` 判断改动。
- 更新发布任务 ID：`019fdfd3-80e4-7622-9be9-7867bad946a5`

上一版 `1.1.24` 信息（作为真实升级测试基线和回滚版本）：

- app 包 SHA-256：`1C1468495B26402DE0524B889AE8B81E9231B79D46A6FC8009B9062166D42711`
- 全量包 SHA-256：`19313B5E2BCC462B69E2200471062291C6F6294FCDD626DB0CCB04A6B60D5B0C`
- 修复包 SHA-256：`30F128BE21D8537261524046380B108CE913415A35794198EEC7B59689343F31`
- 当时升级/回滚验证覆盖了 25 类受保护用户数据。

`1.1.25` 已正式发布。不要重复上传或再次激活同一版本；后续如需再改动，必须递增新版本并重新走完整验证门槛。

## 3. 已完成并验证的内容

### 3.1 当前源码测试

2026-08-21 在当前 `1.1.25` 源码运行：

```powershell
Set-Location -LiteralPath 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation'
npm.cmd test
```

结果：本次先把两个错误期望改成新业务规则，确认它们在旧实现上失败；修复实现后，定向测试和全部自动化测试均通过，包括 `state`、`status-utils`、兜底、浏览器错误分类、飞书待写恢复和运行顺序测试。

当前回归测试固定了以下行为：

- `app\automation\test\state.test.js` 中 `testStaleActiveFailuresMigrateToTerminalOnce`：旧活动记录只迁移一次，今日活动记录保留，自定义字段不丢失。
- `app\automation\test\status-utils.test.js`：旧主失败、今日主重试、今日兜底重试、旧主与今日兜底同 ID、成功优先级和去重统计。

### 3.2 用户提供的另一台电脑快照

只读样本位置：

- `C:\Users\Administrator\Desktop\中专\data`
- `C:\Users\Administrator\Desktop\中专\logs`
- `C:\Users\Administrator\Desktop\中专\状态面板.txt`
- `C:\Users\Administrator\Desktop\中专\兜底状态.json`
- `C:\Users\Administrator\Desktop\中专\兜底日志.txt`

这些是复制出来的快照，不是那台电脑的实时状态。快照最后修改时间约为 2026-08-21 02:54，日志约到 03:04。

状态面板记录：

- 上次检测时间：2026-08-21 01:34:11
- 本轮扫描：1000 本
- 本轮判定当日上架：6 本
- 今日发现总书籍：78 本
- 今日实际出书：0 本
- 待处理：0 本
- 重试队列：480 本
- 彻底失败队列：0 本

对 JSON 做去重核对后，`480` 的准确构成为：

| 分类 | 数量 | 应有归属 |
|---|---:|---|
| 仅旧日期平台记录 | 407 | 彻底失败 |
| 仅今日兜底失败 | 63 | 重试 |
| 今日平台活动失败 | 6 | 重试 |
| 旧平台记录与今日兜底重叠 | 4 | 今天按兜底继续重试，不同时计入彻底失败 |
| 去重合计 | 480 | 正确界面应约为：重试 73、彻底失败 407 |

主失败文件 `failed_queue.json` 的旧记录证据：

- 活动主队列：6 本
- `terminalFailures`：411 本
- 411 本全部失败次数小于 24，却被当前代码当作“可恢复的午夜失败”
- 日期分布：2026-08-13 为 76 本、08-17 为 15 本、08-19 为 101 本、08-20 为 219 本
- 失败次数分布：1 次 331 本、2 次 52 本、3 次 18 本、4 次 10 本
- 其中 407 本只属于旧平台记录，另 4 本当天又在兜底表格出现

兜底快照：

- `books` 共 638 条
- 当前失败/重试 67 条，日期均为 2026-08-21
- 67 条中 4 条与旧平台记录重叠

## 4. 已确认根因

### 4.1 旧日期书被重新恢复

文件：`app\automation\src\state.js`

- `FAILED_RETRY_MS` 为 1 小时。
- `FAILED_MAX_COUNT` 为 24。
- `recoverPrematureTerminalFailures()` 会把失败次数小于 24、原因以 `失败书籍已过当天，不再重试：` 开头的彻底失败记录重新放回活动队列。
- `readFailedQueue()` 每次读取时都会执行上述恢复，并可能直接重写真实 `failed_queue.json`。

这与用户已经确认的规则冲突：旧日期书应直接彻底失败，不应跨天恢复到重试队列。

### 4.2 状态面板把旧记录重新计入重试

文件：`app\automation\src\status-utils.js`

- `isPrematureMidnightFailure()` 把上述旧记录定义成“过早彻底失败”。
- `operationalCounts()` 再次把它们加入 `retrying`。
- `terminalFailureDetails()` 反而跳过这些记录，所以界面显示“重试 480、彻底失败 0”。

### 4.3 现有测试保护了错误行为

- `app\automation\test\state.test.js` 明确断言旧日期书应该恢复到队列。
- `app\automation\test\status-utils.test.js` 明确断言该记录计入重试而非彻底失败。

必须先改变测试期望，再改实现；否则未来仍可能回归。

## 5. 正式发布结果

### 5.1 候选制作与泄漏审计

- 权威源码：`E:\自动化\gengxin\dian-zhong-chu-shu\app`
- 隔离构建目录：`E:\自动化\gengxin\_build-dian-zhong-chu-shu-1.1.25`
- 更新包文件数：189；完整包文件数：193。
- 两个 ZIP 的递归审计结果均为 0 个受保护条目。
- 未包含 ChromeProfile、配置 TXT/根 JSON、API 密钥样式文件、队列、日志、输入输出、失败目录、小说目录、兜底链接、兜底状态或兜底日志。
- 完整包更新器配置继续使用 `preservePaths: ["*"]`。
- 包内 `state.js`、`status-utils.js` 与第 0 节权威源码哈希一致。

### 5.2 正式文件与公网地址

- 更新包 SHA-256：`52B208CDCCA4265D3D87E6CE26D88064E1B33ED4A6C0D1CFADB9EF08A6F17A5A`
- 完整包 SHA-256：`ABBD6E6455894D8B2BD75D9815D1AA1AFF4B0E2BB3A20A07FFDD807CE62BFD9F`
- 版本化清单 SHA-256：`87B0F0E4414CF4816B967FC0AEE97DD3EC097CD95CBEF771484D9305B3535407`
- 主清单：`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu/latest.json`
- 安全清单：`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu-safe/latest.json`
- 版本化更新包：`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/updates/dian-zhong-chu-shu/1.1.25/app.zip`
- 完整包：`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/downloads/packages/dian-zhong-chu-shu-1.1.25.zip`
- 兼容旧目录的完整包：`https://luotuoruanjiangengx.oss-cn-beijing.aliyuncs.com/packages/dian-zhong-chu-shu-1.1.25.zip`

上传后使用普通 HTTPS 重新下载：更新包 37,598,027 字节，完整包 37,613,085 字节；下载文件 SHA-256 与本地完全一致。主/安全清单、根目录索引和下载索引均独立回读为 `1.1.25`。

### 5.3 正式候选真实升级/回滚

使用 SHA-256 为 `19313B5E2BCC462B69E2200471062291C6F6294FCDD626DB0CCB04A6B60D5B0C` 的真实 `1.1.24` 完整包作为基线，调用该包自带的 `UpdateAgent.exe` 从公网版本化清单升级：

- 升级后版本：`1.1.25`
- 25 项配置、Chrome 登录数据、队列、日志、输入输出、小说和自建文件逐字节不变
- 9 个清单必需程序文件存在
- `app.previous` 已生成
- 第二次同版本检查不改动数据
- 调用实际 `UpdateTransaction.RollbackApp()` 后恢复到 `1.1.24`
- 回滚后 25 项受保护数据仍逐字节不变

更新任务会话 `019fdfd3-80e4-7622-9be9-7867bad946a5` 已收到版本、哈希、下载地址和验证结果；不要在该会话重复发布。

## 6. 下一步

本次发布工作已完成。下一次续作只需：

1. 只读确认实际用户电脑通过更新器进入 `1.1.25`，并核对其真实配置、数据和日志仍在。
2. 观察新版运行日志与状态面板，确认旧日期记录不再回到重试队列、统计符合业务预期。
3. “兜底长时间运行可能延迟平台扫描和主重试”仍是独立的中优先级结构问题；如要处理，应另开一次范围明确的修改和发布，不要混入本次已发布版本。

## 7. 运行与验证命令

### 全部自动化测试

```powershell
Set-Location -LiteralPath 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation'
npm.cmd test
```

### 定向测试

```powershell
node 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation\test\state.test.js'
node 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation\test\status-utils.test.js'
```

### 构建桌面控制台

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'E:\自动化\gengxin\dian-zhong-chu-shu\app\desktop\build-desktop.ps1'
```

### 一键自检

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation\scripts\self-check.ps1'
```

### 启动桌面程序

```powershell
Start-Process -FilePath 'E:\自动化\gengxin\dian-zhong-chu-shu\Start.cmd'
```

### 停止所有相关进程

仅在用户明确同意进行本机运行测试时使用；不要为了查看代码擅自停止正在工作的实例。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'E:\自动化\gengxin\dian-zhong-chu-shu\app\automation\scripts\stop-all.ps1'
```

## 8. 已知问题与风险

### 已解决：跨天旧书错误恢复

这是 `1.1.24` 的历史高优先级问题，已在 `1.1.25` 修复并发布。新版 `readFailedQueue()` 不再把旧日期彻底失败记录重新写入真实活动队列；回归测试、快照离线验证和正式候选升级验证均已通过。

### 中优先级：兜底可能延迟平台扫描和主重试

文件：`app\automation\src\watch-40min.js`

- 兜底先运行，再运行平台扫描。
- 两者和后台重试共用一个全局 `running` 标志。
- 长时间兜底运行时，5 分钟重试轮询会直接返回，平台扫描也要等待兜底完成。

此前日志显示程序不是完全卡死，而是在串行处理大量兜底行；但该结构会造成主扫描/主重试延迟。此问题本次未修改，后续应单独评估和发布，避免与已完成的跨天队列修复混在一起。

### 数据快照不是实时状态

`C:\Users\Administrator\Desktop\中专` 下的资料是另一台电脑复制出的快照。不能用它判断该电脑此刻是否仍在运行，也不能直接覆盖回原电脑。

### 发布工具备注：旧修复器测试不属于本次包

`windows-updater-source\build.ps1 -Test All` 中独立的 `HunJianUpdaterRepair` 测试仍硬编码历史修复载荷哈希，与当前 `bin\UpdateAgent.exe` 不一致，因此该单项会在进入正式 EXE 编译前失败。本次点重完整包不包含该修复器，也未修改它；与本次发布相关的 Core、Transaction、Agent 测试均单独通过，正式 `1.1.24`→`1.1.25` UpdateAgent 升级和回滚也已通过。后续若重新发布旧损坏版本修复器，应单独更新其载荷、预期哈希和测试，不能把当前 Agent 随意替换进去。

### 无 Git 保护

权威目录不是 Git 仓库。每次改动前要记录文件哈希或在项目外建立隔离副本；不要把 `.bak`、测试数据或用户配置留在将来会被打包的 `app` 内。

## 9. 不能误动的数据和配置

以下内容属于用户数据、登录状态、业务配置、运行记录或恢复依据。修复、打包、升级和回滚时必须保留；不得清空、覆盖、重命名、硬编码或写入发布包的默认值覆盖用户值。

### 应用根目录用户数据

- `app\ChromeProfile\`：Google Chrome 登录状态
- `app\兜底\` 中用户填写的兜底链接和状态数据
- `app\小说原文\`
- `app\可改小说\`
- `app\网址.txt`
- `app\网站密码.txt`
- `app\飞书接口和链接.txt`
- `app\企业微信.txt`
- `app\企业微信发送开关.txt`
- `app\DeepSeek接口.txt`：当前实际为阿里云 DashScope/DeepSeek 配置，含密钥，不能在日志或交接中打印内容
- `app\选择资源id.txt`
- `app\违禁词.txt`
- `app\广告标签合规规则.txt`
- `app\自动化模式.json`
- 目录内遗留乱码文件名的配置文件也不要删除，旧版本可能仍引用

### 自动化运行数据

- `app\automation\data\`
- `app\automation\logs\`
- `app\automation\input\`
- `app\automation\output\`
- `app\automation\failed\`
- `failed_queue.json`
- `queue.json`
- `output_history.jsonl`
- `today_detected_books.jsonl`
- `scan_history.jsonl`
- `seen_books.json`
- `tag_cache.json`
- `notification_queue.json`
- `pending-feishu\`（如存在）
- 兜底状态、兜底日志以及批量书籍 ID 文件

### 更新与回滚数据

- 用户安装目录中的 `app.previous\`：升级失败/数据恢复依据
- `updater\` 及其用户实际启用状态
- 当前发布包、清单和唯一回滚包

不要把任何 API Key、App Secret、企业微信 webhook、飞书文档链接或登录 Cookie 写入 `TIMEOFF.md`、测试输出、提交记录或发布清单。

## 10. 修复验收状态

1. ✅ 定向测试和 `npm.cmd test` 全部通过。
2. ✅ 快照离线计算为重试 73、彻底失败 407；同 ID 不双计数。
3. ✅ 旧书不会被 `readFailedQueue()` 再次写回活动队列。
4. ✅ 实际文件迁移重复读取结果一致，JSON 保留自定义字段，不产生重复彻底失败记录。
5. ✅ 今日主任务和今日兜底任务仍能重试；成功记录从重试/彻底失败移除并计入今日已处理，已有回归测试保护。
6. ✅ 隔离桌面控制台能打开，自检通过，隔离状态文件和 UI 统计数据源为 73/407；窗口结构已核对。截图接口不支持该 WinForms 窗口，未取得截图证据。
7. ✅ 正式候选包的 UpdateAgent 端到端升级、同版本复查和实际回滚通过；25 项受保护数据逐字节不变，`app.previous` 行为正确。
8. ✅ `1.1.25` 已正式发布；两个包公网下载回读哈希一致，四个线上入口均为 `1.1.25`，更新任务已收到通知。

## 11. 本机历史发布文件清理（2026-08-21 04:08）

按用户要求仅清理本机磁盘中的点重出书历史发布产物，线上 OSS 对象未删除或改动。

- 永久删除 32 个旧构建、候选、staging 和旧包目标，不进入回收站。
- 释放 `3,901,323,689` 字节，即 `3.633 GiB`。
- 已删除 `1.1.23` 及更早的本地构建目录、`1.1.17` 候选/升级证明、旧普通/安全发布目录、旧升级测试 staging、旧网站本地包和 `1.0.0` 更新器修复包。
- 已删除 `1.1.24/1.1.25` 构建中的展开 `app`、`full` 目录以及 `1.1.25` 公网回读副本；这些是可由权威源码和正式 ZIP 重建的重复中间文件。
- 本机版本构建根目录现在只剩 `1.1.24` 和 `1.1.25`。
- `1.1.24` 更新包 SHA-256：`1C1468495B26402DE0524B889AE8B81E9231B79D46A6FC8009B9062166D42711`
- `1.1.24` 完整包 SHA-256：`19313B5E2BCC462B69E2200471062291C6F6294FCDD626DB0CCB04A6B60D5B0C`
- `1.1.25` 更新包 SHA-256：`52B208CDCCA4265D3D87E6CE26D88064E1B33ED4A6C0D1CFADB9EF08A6F17A5A`
- `1.1.25` 完整包 SHA-256：`ABBD6E6455894D8B2BD75D9815D1AA1AFF4B0E2BB3A20A07FFDD807CE62BFD9F`
- `1.1.24` 更新器修复包、权威源码、原桌面 EXE、ChromeProfile、配置、自动化数据和日志均保留。
- 清理后再次干跑结果为 0 个待删除目标；四个保留包 SHA-256 全部复核通过。

可重复审计脚本：`C:\Users\Administrator\Documents\Codex\2026-07-14\zen\Cleanup-DianZhong-Keep-1.1.24-1.1.25.ps1`

## 12. Git 源码交接与持续验证（2026-08-30）

- 源码远程仓库：`https://github.com/nmrsz645-bit/dianzhongchushu.git`，默认分支 `main`。
- 已纳入交接：源码、依赖锁文件、README、开发约定、`.env.example`、发布排除规则 `app/.publish-exclude.txt` 和本地使用说明。
- 已明确排除：Chrome 登录态、各类密钥/账号/链接配置、小说与兜底业务数据、运行队列、日志、输出、依赖目录、历史发布包和回滚数据。
- 全新克隆已验证 `npm ci --ignore-scripts`、`npm.cmd test` 及桌面 EXE 构建均可通过；新电脑要实际运行时仍须由用户私密补齐配置并重新登录 Chrome。
- 已添加 GitHub Actions Windows Node 测试。它只检查无凭据源码，不能替代真实 Chrome、隔离升级/回滚或公网哈希回读。
- 正式更新发布仍依赖独立、经审计的 Windows 更新器工具链；不将共用更新器目录、其备份或二进制文件复制进本仓库。未完成正式发布验证前，不得切换线上 `latest.json` 或 `catalog.json`。

## 13. 新电脑接手修正（2026-08-31）

- `bootstrap-config.ps1` 已补齐 `选择资源id.txt` 与 `违禁词.txt` 的仅新建占位文件；不会覆盖用户已有配置。
- 守护轮次改为先平台扫描（其内部包含失败队列重试），再执行兜底，避免长兜底延后本轮主扫描和重试；测试覆盖该顺序。
- 兜底与平台仍不并行，原因是共用 Chrome 持久登录目录。若将来需要并发，必须先隔离浏览器 Profile 与状态写入，不能仅移除运行锁。
- 自检改为校验飞书实际需要的 App ID、App Secret 和链接；配置引导的占位文本会明确报为未填写，不再把任意长文本误判为已配置。
- 配置引导中兜底文件路径改为标准 Join-Path，兼容新电脑常见的 Windows PowerShell 5.1 与当前 PowerShell 7。
- 引导与自检脚本不再依赖 UTF-8 无 BOM 文件内的中文正则或占位文本；Windows PowerShell 5.1 已实际执行配置引导，自检会正确识别占位而非误判。
