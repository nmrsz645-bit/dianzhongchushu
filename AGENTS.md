# 点重出书开发约定

## 首次接手

先读 `HANDOFF.md`、本文件和 `docs/RELEASE-GUIDE.md`，并只读核对 Git 分支、工作区、HEAD 与 origin/main；`TIMEOFF.md` 先读顶部“当前交接快照”。以 `app/version.json` 判断版本，不以安装目录名判断。

## 不可提交或覆盖的数据

- `app/ChromeProfile/`、所有根目录配置 TXT/JSON、密码和 API/Webhook。
- `app/automation/data/`、`logs/`、`input/`、`output/`、`failed/`。
- `app/小说原文/`、`app/可改小说/`、兜底链接/状态/日志。

修改或发布时不得清空、重建、重命名这些数据；更新器必须保留用户数据和 `app.previous`。

## 验证与发布

- 改动自动化逻辑后至少运行 `app/automation` 下的 `npm.cmd test`。
- `app/.publish-exclude.txt` 是受版本控制的发布数据排除规则；新增用户数据目录时必须同步更新并审计它。
- 发布前从权威源码建立隔离候选包，审计不得含用户数据或凭据。
- 先完成隔离升级/回滚与公网哈希回读，最后才切换主/安全 `latest.json`。历史 `catalog.json` 仅在确认具体读取方、兼容字段且获得对应授权后才修改；当前下载站不读取它。
- 当前已发布版本为 `1.1.27`；没有新改动和完整验证时，不得重复发布。

## 跨电脑交接边界

- Git 仓库可复现源码、依赖安装、自动化测试和桌面 EXE 构建；首次接手需按 `app/使用说明-点重自动化.txt` 私密配置并重新登录 Chrome。
- 仓库跟踪已发布的 `updater/UpdateAgent.exe`、开关和配置；其原始源码和制包工具链仍缺失。不得以其他项目更新器充数；未恢复对应工具链并完成正式发布验收前，不得上线新的自动更新包。
- GitHub Actions 仅运行无凭据的 Node 测试，不能替代真实 Chrome、隔离升级/回滚或公网回读。

## 当前已知问题

守护程序会先完成平台扫描（含失败队列重试），再执行兜底。两者仍刻意串行，因为它们共用 Chrome 持久登录目录；极长的兜底可能推迟下一轮，但不能在未改造 Chrome/Profile 与状态文件隔离前并行执行。
