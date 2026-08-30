# 点重出书开发约定

## 首次接手

先读 `README.md` 和 `TIMEOFF.md`，再运行 `git status --short`。以 `app/version.json` 判断版本，不以安装目录名判断。

## 不可提交或覆盖的数据

- `app/ChromeProfile/`、所有根目录配置 TXT/JSON、密码和 API/Webhook。
- `app/automation/data/`、`logs/`、`input/`、`output/`、`failed/`。
- `app/小说原文/`、`app/可改小说/`、兜底链接/状态/日志。

修改或发布时不得清空、重建、重命名这些数据；更新器必须保留用户数据和 `app.previous`。

## 验证与发布

- 改动自动化逻辑后至少运行 `app/automation` 下的 `npm.cmd test`。
- 发布前从权威源码建立隔离候选包，审计不得含用户数据或凭据。
- 先完成隔离升级/回滚与公网哈希回读，最后才切换 `latest.json`、`catalog.json`。
- 当前已发布版本为 `1.1.25`；没有新改动和完整验证时，不得重复发布。

## 当前已知问题

兜底任务与平台扫描共用运行锁，长时间兜底可能延迟平台扫描和主重试；这是独立问题，处理时应单独评估、测试和发布。
