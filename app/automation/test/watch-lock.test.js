const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SRC_DIR = path.join(__dirname, "..", "src");

function mockModule(name, exports) {
  const resolved = require.resolve(path.join(SRC_DIR, name));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function clearWatchModules() {
  for (const name of ["watch-40min.js", "logger.js", "mode-settings.js", "notification-utils.js", "scan-once.js", "settings.js", "process-lock.js"]) {
    delete require.cache[require.resolve(path.join(SRC_DIR, name))];
  }
  const fallback = require.resolve(path.join(__dirname, "..", "..", "兜底", "run-once.js"));
  delete require.cache[fallback];
}

async function testBusyWatchdogLockExitsWithoutScanning() {
  clearWatchModules();
  const events = [];
  const intervals = [];
  const originalSetInterval = global.setInterval;
  global.setInterval = (fn, ms) => {
    intervals.push({ fn, ms });
    return 1;
  };

  mockModule("logger.js", { log: (message) => events.push(message) });
  mockModule("mode-settings.js", { modeText: () => "平台+兜底", readModeSettingsFromFile: () => ({ platformEnabled: true, fallbackEnabled: true }) });
  mockModule("notification-utils.js", { notifyOrQueueWechat: async () => {} });
  mockModule("scan-once.js", { scanOnce: async () => events.push("scan") });
  mockModule("settings.js", { SCAN_INTERVAL_MS: 1000 });
  mockModule("process-lock.js", {
    acquireLock: () => ({ acquired: false, activePid: 4567 }),
    releaseLock: () => {},
    watchdogLockFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dz-watch-")), "watchdog.lock"),
  });
  const fallbackPath = require.resolve(path.join(__dirname, "..", "..", "兜底", "run-once.js"));
  require.cache[fallbackPath] = { id: fallbackPath, filename: fallbackPath, loaded: true, exports: { runFallbackOnce: async () => {} } };

  try {
    const watcher = require("../src/watch-40min");
    const code = watcher.startWatch();
    assert.strictEqual(code, 77);
    assert(events.some((message) => message.includes("已有7x24守护进程运行中")));
    assert(!events.includes("scan"));
    assert.strictEqual(intervals.length, 0);
  } finally {
    global.setInterval = originalSetInterval;
    clearWatchModules();
  }
}

async function testRunHonorsOnlyFallbackMode() {
  clearWatchModules();
  const events = [];
  mockModule("logger.js", { log: (message) => events.push(message) });
  mockModule("mode-settings.js", { modeText: () => "仅兜底", readModeSettingsFromFile: () => ({ platformEnabled: false, fallbackEnabled: true }) });
  mockModule("notification-utils.js", { notifyOrQueueWechat: async () => {} });
  mockModule("scan-once.js", { scanOnce: async () => events.push("scan") });
  mockModule("settings.js", { SCAN_INTERVAL_MS: 1000 });
  mockModule("process-lock.js", {
    acquireLock: () => ({ acquired: true, file: "x", pid: process.pid }),
    releaseLock: () => {},
    watchdogLockFile: "x",
  });
  const fallbackPath = require.resolve(path.join(__dirname, "..", "..", "兜底", "run-once.js"));
  require.cache[fallbackPath] = { id: fallbackPath, filename: fallbackPath, loaded: true, exports: { runFallbackOnce: async () => events.push("fallback") } };

  try {
    const watcher = require("../src/watch-40min");
    await watcher.run();
    assert(!events.includes("scan"));
    assert(events.includes("fallback"));
  } finally {
    clearWatchModules();
  }
}

async function testPlatformScanRunsBeforeFallback() {
  clearWatchModules();
  const events = [];
  mockModule("logger.js", { log: (message) => events.push(message) });
  mockModule("mode-settings.js", { modeText: () => "平台+兜底", readModeSettingsFromFile: () => ({ platformEnabled: true, fallbackEnabled: true }) });
  mockModule("notification-utils.js", { notifyOrQueueWechat: async () => {} });
  mockModule("scan-once.js", { scanOnce: async () => events.push("scan") });
  mockModule("settings.js", { SCAN_INTERVAL_MS: 1000 });
  mockModule("process-lock.js", { acquireLock: () => ({ acquired: true }), releaseLock: () => {}, watchdogLockFile: "x" });
  const fallbackPath = require.resolve(path.join(__dirname, "..", "..", "兜底", "run-once.js"));
  require.cache[fallbackPath] = { id: fallbackPath, filename: fallbackPath, loaded: true, exports: { runFallbackOnce: async () => events.push("fallback") } };

  try {
    const watcher = require("../src/watch-40min");
    await watcher.run();
    assert.deepStrictEqual(events.filter((event) => event === "scan" || event === "fallback"), ["scan", "fallback"]);
  } finally {
    clearWatchModules();
  }
}

(async () => {
  await testBusyWatchdogLockExitsWithoutScanning();
  await testRunHonorsOnlyFallbackMode();
  await testPlatformScanRunsBeforeFallback();
  console.log("watch-lock tests passed");
})();
