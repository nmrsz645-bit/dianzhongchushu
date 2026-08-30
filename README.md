# 点重出书

Windows 本地桌面自动化：扫描符合条件的书籍、生成推广信息、写入飞书，并保存小说文本。当前源码/线上版本为 `1.1.25`。

## 接手前先读

1. `AGENTS.md`：开发和数据保护边界。
2. `TIMEOFF.md`：当前验证、发布记录、已知问题及下一步。
3. `app/automation/package.json`：Node 脚本和依赖。

## 开发环境

- Windows 10/11、Google Chrome、Node.js 24 或兼容版本。
- 在 `app/automation` 执行 `npm ci` 安装依赖。
- 桌面程序可在 `app/desktop` 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File build-desktop.ps1` 构建。

## 验证

```powershell
Set-Location -LiteralPath '.\app\automation'
npm.cmd test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\self-check.ps1'
```

`self-check.ps1` 会读取本机配置，缺少配置时可能报失败；不得为了通过检查写入真实密钥或覆盖用户数据。

## 启动

完成本机配置和登录后，通过项目根目录 `Start.cmd` 启动。首次接手只做测试或代码检查时，不要启动自动出书和 40 分钟守护。

## 数据与配置

所有 Chrome 登录态、API/Webhook/密码文本、兜底状态、队列、日志、输入输出和小说目录均被 `.gitignore` 排除，不会随 Git 迁移。新电脑需由用户私密配置；不要从仓库补写这些内容。
