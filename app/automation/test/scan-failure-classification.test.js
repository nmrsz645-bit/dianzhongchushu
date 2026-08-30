const assert = require("assert");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

function mockModule(name, exports) {
  const resolved = require.resolve(path.join(SRC_DIR, name));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function clearModules() {
  for (const name of [
    "scan-once.js", "browser.js", "logger.js", "notification-utils.js", "run-book.js",
    "settings.js", "status-utils.js", "platform-utils.js", "platform-browser.js", "state.js",
  ]) delete require.cache[require.resolve(path.join(SRC_DIR, name))];
}

async function runCase(error) {
  clearModules();
  let queueWrites = 0;
  mockModule("browser.js", { isBrowserSessionError: (value) => value?.code === "BROWSER_SESSION_UNAVAILABLE", openContext: async () => ({}) });
  mockModule("logger.js", { log: () => {} });
  mockModule("notification-utils.js", { flushWechatNotifications: async () => {}, notifyOrQueueWechat: async () => {} });
  mockModule("run-book.js", {
    isPendingOutputError: (value) => value?.code === "PENDING_OUTPUT_RECOVERY",
    processBook: async () => { throw error; },
    retryPendingOutputs: async () => [],
  });
  mockModule("settings.js", { MAX_FAILED_RETRIES_PER_SCAN: 10, SCAN_INTERVAL_MS: 1000, SCAN_PAGES: 1 });
  mockModule("status-utils.js", { formatChinaTime: () => "", readTodayOutputCount: () => 0, recordTodayDetectedBooks: () => 0, writeStatusPanel: () => {} });
  mockModule("platform-utils.js", { isTodayChina: () => true, todayChinaDate: () => "2026-08-20" });
  mockModule("platform-browser.js", { clickNextPromotionPage: async () => false, openPromotionList: async () => {}, readCurrentPromotionRows: async () => [] });
  mockModule("state.js", {
    appendScanHistory: () => {},
    buildFailedQueueState: (state) => state,
    dueFailedBooks: () => [],
    expireStaleFailedBooks: (state) => state,
    readFailedQueue: () => ({ queue: {}, terminalFailures: [] }),
    readSeenBookIds: () => new Set(),
    removeFailedBook: (state) => state,
    writeFailedQueue: () => { queueWrites += 1; },
    writeJson: () => {},
    writeSeenBookIds: () => {},
  });

  try {
    const { processWithFailureQueue } = require("../src/scan-once");
    const promise = processWithFailureQueue("11000000001", null, { queue: {}, terminalFailures: [] });
    if (error.code === "BROWSER_SESSION_UNAVAILABLE") await assert.rejects(() => promise, /browser unavailable/);
    else assert.strictEqual(await promise, false);
    return queueWrites;
  } finally {
    clearModules();
  }
}

(async () => {
  assert.strictEqual(await runCase(Object.assign(new Error("browser unavailable"), { code: "BROWSER_SESSION_UNAVAILABLE" })), 0);
  assert.strictEqual(await runCase(Object.assign(new Error("pending"), { code: "PENDING_OUTPUT_RECOVERY" })), 0);
  console.log("scan-failure-classification tests passed");
})();
