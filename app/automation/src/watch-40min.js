const { log } = require("./logger");
const { isBrowserSessionError } = require("./browser");
const { modeText, readModeSettingsFromFile } = require("./mode-settings");
const { notifyOrQueueWechat } = require("./notification-utils");
const { retryDueFailures, scanOnce } = require("./scan-once");
const { SCAN_INTERVAL_MS } = require("./settings");
const { readFailedQueue } = require("./state");
const { acquireLock, releaseLock, watchdogLockFile } = require("./process-lock");
const { millisecondsUntilNextChinaMidnight, refreshDailyStatus, updateStatusFields } = require("./status-utils");
const { runFallbackOnce } = require("../../兜底/run-once");

const FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_POLL_INTERVAL_MS = 5 * 60 * 1000;

let running = false;
let lastFallbackAt = 0;

async function run() {
  if (running) {
    log("上一轮还在运行，本轮跳过");
    return;
  }
  running = true;
  try {
    updateStatusFields({ runtimeHealth: "运行中", lastGlobalError: "" });
    const mode = readModeSettingsFromFile();
    log(`当前运行模式：${modeText(mode)}`);
    const now = Date.now();
    if (mode.platformEnabled) {
      await scanOnce();
    } else {
      log("平台扫描已关闭，本轮跳过平台出书");
    }
    if (mode.fallbackEnabled && now - lastFallbackAt >= FALLBACK_INTERVAL_MS) {
      lastFallbackAt = now;
      log("开始执行1小时兜底检查");
      await runFallbackOnce();
    } else if (!mode.fallbackEnabled) {
      log("兜底链接已关闭，本轮跳过兜底出书");
    }
    updateStatusFields({ runtimeHealth: "正常", lastGlobalError: "" });
  } catch (error) {
    const reason = String(error?.message || error || "");
    updateStatusFields({
      runtimeHealth: isBrowserSessionError(error) ? "浏览器不可用" : "本轮异常",
      lastGlobalError: reason.slice(0, 1000),
    });
    log(`本轮失败：${error.stack || reason}`);
    await notifyOrQueueWechat(`点重自动化全局错误：${reason}`).catch((notifyError) => log(`企业微信通知入队失败：${notifyError.message}`));
  } finally {
    running = false;
  }
}

async function runRetryQueue() {
  if (running || typeof retryDueFailures !== "function") return;
  running = true;
  try {
    await retryDueFailures(null, readFailedQueue());
  } catch (error) {
    const reason = String(error?.message || error || "");
    log(`失败队列后台重试异常：${error.stack || reason}`);
  } finally {
    running = false;
  }
}

function startWatch() {
  const lock = acquireLock(watchdogLockFile, { kind: "watchdog" });
  if (!lock.acquired) {
    log(`已有7x24守护进程运行中，本次启动退出。PID：${lock.activePid || "unknown"}`);
    return 77;
  }

  const cleanup = () => releaseLock(lock);
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  const scheduleMidnightRefresh = () => {
    setTimeout(() => {
      refreshDailyStatus();
      scheduleMidnightRefresh();
    }, millisecondsUntilNextChinaMidnight());
  };

  refreshDailyStatus();
  scheduleMidnightRefresh();

  log("每40分钟监控启动");
  run();
  setInterval(run, SCAN_INTERVAL_MS);
  setInterval(runRetryQueue, RETRY_POLL_INTERVAL_MS);
  return 0;
}

if (require.main === module) {
  const code = startWatch();
  if (code) process.exitCode = code;
}

module.exports = { run, runRetryQueue, startWatch };
