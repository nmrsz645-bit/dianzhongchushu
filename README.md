# 点重出书

Windows 本地桌面自动化：扫描符合条件的书籍、生成推广信息、写入飞书，并保存小说文本。当前待发布源码版本为 `1.1.27`；线上已发布版本为 `1.1.26`。

## 接手前先读

1. `AGENTS.md`：开发和数据保护边界。
2. `TIMEOFF.md`：当前验证、发布记录、已知问题及下一步。
3. `app/automation/package.json`：Node 脚本和依赖。

## 开发环境

- Windows 10/11、Google Chrome、Node.js 24 或兼容版本。
- 在 `app/automation` 执行 `npm ci` 安装依赖。
- 桌面程序可在 `app/desktop` 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File build-desktop.ps1` 构建。首次构建会下载、SHA-256 校验并内置官方 Node.js 24.19.0 x64 运行时；完整桌面包无需另装 Node.js，桌面界面、守护和公开的 BAT 启动入口都会优先使用该运行时。

## 验证

```powershell
Set-Location -LiteralPath '.\app\automation'
npm.cmd test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\self-check.ps1'
```

`self-check.ps1` 会读取本机配置，缺少配置时可能报失败；不得为了通过检查写入真实密钥或覆盖用户数据。

AI 标签可在桌面程序的“配置中心 → AI”中手动选择 `deepseek-v4-flash-0731`（默认）或 `qwen3.8-flash`。使用阿里云百炼 OpenAI 兼容地址时，程序会在每次请求中强制传入 `enable_thinking: false`；API Key 仅保存在本机的 `app\DeepSeek接口.txt`，不要提交或发送到聊天中。

## 启动

完成本机配置和登录后，通过项目根目录 `Start.cmd` 启动。首次接手只做测试或代码检查时，不要启动自动出书和 40 分钟守护。

新电脑先运行下列命令生成**仅限本机、不会覆盖已有内容**的配置占位文件，再由用户私密填写并通过自检：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\app\automation\scripts\bootstrap-config.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\app\automation\scripts\self-check.ps1'
```

## 数据与配置

所有 Chrome 登录态、API/Webhook/密码文本、兜底状态、队列、日志、输入输出和小说目录均被 `.gitignore` 排除，不会随 Git 迁移。新电脑需由用户私密配置；不要从仓库补写这些内容。

`app/.publish-exclude.txt` 和 `app/使用说明-点重自动化.txt` 属于可公开交接的发布规则与使用说明，已随源码版本控制。新增用户数据目录时，必须同步检查发布排除规则，不能让数据进入下载包。

## 持续验证

推送到 `main` 或提交拉取请求时，GitHub Actions 会在 Windows 环境执行 `npm ci --ignore-scripts` 和 `npm test`。它只验证源码，不使用任何本机配置、登录态或业务数据。

## 正式发布边界

本仓库可在新电脑复现源码检查、自动化测试和桌面 EXE 构建；它**不包含**共享的 Windows 更新器工具链。正式制作并上线更新包前，必须另行取得经过审计的更新器工具链，并完成隔离升级/回滚、SHA-256 和公网回读验证。不得仅因 Git 克隆成功就发布或切换 `latest.json`、`catalog.json`。
