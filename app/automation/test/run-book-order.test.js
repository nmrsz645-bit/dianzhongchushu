const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

function mockModule(name, exports) {
  const resolved = require.resolve(path.join(SRC_DIR, name));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearRunBookModules() {
  for (const name of [
    "run-book.js",
    "ai-tags.js",
    "browser.js",
    "feishu-utils.js",
    "logger.js",
    "paths.js",
    "pending-feishu.js",
    "platform-browser.js",
    "platform-utils.js",
    "process-lock.js",
    "status-utils.js",
    "text-utils.js",
    "wechat-send-setting.js",
    "wechat-utils.js",
  ]) {
    delete require.cache[require.resolve(path.join(SRC_DIR, name))];
  }
}

async function runProcessBook({ duplicate = false, force = false, lockBusy = false, writeFailsOnce = false } = {}) {
  clearRunBookModules();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dz-run-book-"));
  const events = [];
  const originalWriteFileSync = fs.writeFileSync;

  fs.writeFileSync = function patchedWriteFileSync(file, content, options) {
    const textFile = String(file);
    if (textFile.includes(`${path.sep}小说原文${path.sep}`) || textFile.includes(`${path.sep}可改小说${path.sep}`)) {
      events.push(`save:${path.basename(textFile)}`);
    }
    return originalWriteFileSync.call(this, file, content, options);
  };

  mockModule("ai-tags.js", {
    selectLabelsWithFallback: async () => ["#林晚", "#沈砚", "#误会", "#豪门", "#反转", "#追妻", "#热门小说"],
  });
  mockModule("browser.js", {});
  mockModule("logger.js", { log: (message) => events.push(`log:${message}`) });
  mockModule("paths.js", {
    dataDir: path.join(tempDir, "data"),
    failedDir: path.join(tempDir, "failed"),
    movableNovelDir: path.join(tempDir, "可改小说"),
    novelOriginalDir: path.join(tempDir, "小说原文"),
    rootDir: tempDir,
    ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
    readTextFile: () => "开",
  });
  mockModule("platform-utils.js", { todayChinaDate: () => "2026-07-09" });
  let pendingTask = null;
  mockModule("pending-feishu.js", {
    listPendingFeishu: () => pendingTask ? [pendingTask] : [],
    readPendingFeishu: () => pendingTask,
    removePendingFeishu: () => { pendingTask = null; },
    savePendingFeishu: (task) => (pendingTask = { ...task }),
  });
  mockModule("process-lock.js", {
    lockFileForBook: (bookId) => `book-${bookId}.lock`,
    withLock: async (file, options, fn) => (lockBusy ? { acquired: false, lock: { activePid: 12345 } } : { acquired: true, result: await fn() }),
  });
  mockModule("text-utils.js", {
    cleanNovelText: (content) => content,
    readForbiddenWords: () => [],
    safeFileName: (name) => name,
  });
  mockModule("status-utils.js", {
    ensureTodayOutput: () => {},
    recordTodayOutput: () => {},
    updateStatusFields: () => {},
  });
  mockModule("wechat-send-setting.js", { isWechatSendEnabled: () => true });
  mockModule("wechat-utils.js", {
    sendWechatFile: async () => events.push("sendWechatFile"),
  });
  mockModule("platform-browser.js", {
    searchBookAndOpenInfo: async () => events.push("search"),
    extractBookInfo: async () => ({ name: "测试书", description: "简介" }),
    listChapters: async () => [{ title: "第1章", href: "/chapter", referralHref: "/referral" }],
    pickDownloadableChapters: (chapters) => chapters,
    readChapterText: async () => "林晚和沈砚在雨夜对质",
    openFirstChapterReferral: async () => events.push("openReferral"),
    createReferralLink: async () => events.push("createReferral"),
    waitLatestReferral: async () => ({ startPage: "pages/index", startParam: "bookId=1" }),
  });
  let writeAttempts = 0;
  mockModule("feishu-utils.js", {
    buildCompleteFeishuRow: ({ bookName }) => ["2026-07-09", bookName, "", "", "", "pages/index", "bookId=1"],
    firstEmptyAtoGRow: () => 2,
    formatFeishuLabel: () => "《测试书》#林晚#沈砚#热门小说",
    hasBookNameInRows: () => duplicate,
    nextManualBookName: () => "《测试书》",
    readValues: async () => (duplicate ? [["date", "book"], ["2026-07-09", "测试书"]] : []),
    resolveFeishu: async () => ({ sheetId: "sheet1" }),
    writeValues: async (ctx, range, values) => {
      writeAttempts += 1;
      events.push(`writeFeishu:${values[0][1]}`);
      if (writeFailsOnce && writeAttempts === 1) throw new Error("temporary Feishu failure");
    },
  });

  try {
    const { processBook } = require("../src/run-book");
    const context = {
      context: { close: async () => {} },
      page: {},
      origin: "https://example.test",
    };
    if (writeFailsOnce) {
      await assert.rejects(
        () => processBook("11000000000", context, { force }),
        (error) => error.code === "PENDING_OUTPUT_RECOVERY"
      );
    }
    const result = await processBook("11000000000", context, { force });
    return { events, result, writeAttempts };
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    clearRunBookModules();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testSavesNovelAndSendsWechatOnlyAfterFeishuWrite() {
  const { events } = await runProcessBook();
  const writeIndex = events.findIndex((event) => event.startsWith("writeFeishu:"));
  const saveIndex = events.findIndex((event) => event.startsWith("save:"));
  const sendIndex = events.indexOf("sendWechatFile");

  assert(writeIndex >= 0, "should write Feishu");
  assert(saveIndex > writeIndex, "should save novel after Feishu write");
  assert(sendIndex > saveIndex, "should send WeChat file after saving successful novel output");
}

async function testDuplicateBookNameDoesNotSaveNovelOrSendWechat() {
  const { events, result } = await runProcessBook({ duplicate: true });

  assert.strictEqual(result.duplicateSkipped, true);
  assert(!events.includes("createReferral"), "duplicate should not create referral link");
  assert(!events.some((event) => event.startsWith("writeFeishu:")), "duplicate should not write Feishu");
  assert(!events.some((event) => event.startsWith("save:")), "duplicate should not save novel files");
  assert(!events.includes("sendWechatFile"), "duplicate should not send WeChat file");
}

async function testForcedDuplicateWritesDecoratedName() {
  const { events, result } = await runProcessBook({ duplicate: true, force: true });
  assert.strictEqual(result.duplicateSkipped, undefined);
  assert(events.includes("createReferral"), "forced duplicate should create a new referral link");
  assert(events.includes("writeFeishu:《测试书》"), "forced duplicate should write the decorated book name");
}

async function testBusyBookLockSkipsProcessing() {
  const { events, result } = await runProcessBook({ lockBusy: true });

  assert.strictEqual(result.lockedSkipped, true);
  assert(!events.includes("search"), "locked book should not open platform search");
  assert(!events.includes("createReferral"), "locked book should not create referral link");
  assert(!events.includes("writeFeishu"), "locked book should not write Feishu");
}

async function testPendingFeishuRecoveryDoesNotCreateSecondReferral() {
  const { events, result, writeAttempts } = await runProcessBook({ writeFailsOnce: true });
  assert.strictEqual(writeAttempts, 2, "should retry only the Feishu write");
  assert.strictEqual(events.filter((event) => event === "createReferral").length, 1, "recovery must not create a second referral link");
  assert.strictEqual(result.bookId, "11000000000");
}

(async () => {
  await testSavesNovelAndSendsWechatOnlyAfterFeishuWrite();
  await testDuplicateBookNameDoesNotSaveNovelOrSendWechat();
  await testForcedDuplicateWritesDecoratedName();
  await testBusyBookLockSkipsProcessing();
  await testPendingFeishuRecoveryDoesNotCreateSecondReferral();
  console.log("run-book-order tests passed");
})();
