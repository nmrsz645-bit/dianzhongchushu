const fs = require("fs");
const path = require("path");
const { selectLabelsWithFallback } = require("./ai-tags");
const { openContext } = require("./browser");
const { buildCompleteFeishuRow, firstEmptyAtoGRow, formatFeishuLabel, hasBookNameInRows, nextManualBookName, readValues, resolveFeishu, toFeishuBookName, writeValues } = require("./feishu-utils");
const { log } = require("./logger");
const {
  createReferralLink,
  extractBookInfo,
  listChapters,
  openFirstChapterReferral,
  pickDownloadableChapters,
  readChapterText,
  searchBookAndOpenInfo,
  waitLatestReferral,
} = require("./platform-browser");
const { dataDir, failedDir, movableNovelDir, novelOriginalDir, rootDir, ensureDir, readTextFile } = require("./paths");
const { listPendingFeishu, readPendingFeishu, removePendingFeishu, savePendingFeishu } = require("./pending-feishu");
const { todayChinaDate } = require("./platform-utils");
const { ensureTodayOutput, recordTodayOutput, updateStatusFields } = require("./status-utils");
const { lockFileForBook, withLock } = require("./process-lock");
const { cleanNovelText, readForbiddenWords, safeFileName } = require("./text-utils");
const { isWechatSendEnabled } = require("./wechat-send-setting");
const { sendWechatFile } = require("./wechat-utils");

const WECHAT_FILE = "\u4f01\u4e1a\u5fae\u4fe1.txt";
const WECHAT_SEND_SWITCH_FILE = "\u4f01\u4e1a\u5fae\u4fe1\u53d1\u9001\u5f00\u5173.txt";
const FORBIDDEN_FILE = "\u8fdd\u7981\u8bcd.txt";
const FEISHU_FILE = "\u98de\u4e66\u63a5\u53e3\u548c\u94fe\u63a5.txt";
const RESOURCE_ID_FILE = "\u9009\u62e9\u8d44\u6e90id.txt";
const DEEPSEEK_FILE = "DeepSeek\u63a5\u53e3.txt";
const TAG_COMPLIANCE_FILE = "\u5e7f\u544a\u6807\u7b7e\u5408\u89c4\u89c4\u5219.txt";

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

async function labelsForBook(bookId, book, novelText) {
  const cacheFile = path.join(dataDir, "tag_cache.json");
  const cache = readJsonFile(cacheFile, {});
  const forbiddenWords = readForbiddenWords(path.join(rootDir, FORBIDDEN_FILE));
  const labels = await selectLabelsWithFallback({
    bookName: book.name,
    description: book.description,
    novelText,
    forbiddenWords,
    configText: readTextFile(DEEPSEEK_FILE, false),
    customRulesText: readTextFile(TAG_COMPLIANCE_FILE, false),
  });
  cache[bookId] = labels;
  writeJsonFile(cacheFile, cache);
  return labels;
}

function isPendingOutputError(error) {
  return error?.code === "PENDING_OUTPUT_RECOVERY";
}

function updatePendingStatus() {
  updateStatusFields({ pendingFeishuCount: listPendingFeishu().length });
}

function exactOutputRowIndex(values, task) {
  return (values || []).findIndex((row) => (
    String((row || [])[1] || "").trim() === String(task.writeBookName || "").trim()
    && String((row || [])[5] || "").trim() === String(task.startPage || "").trim()
    && String((row || [])[6] || "").trim() === String(task.startParam || "").trim()
  ));
}

function pendingOutputError(task, error) {
  if (isPendingOutputError(error)) return error;
  const wrapped = new Error(`推广链接已生成，后续待恢复：${task.bookId}，${error?.message || error}`, { cause: error });
  wrapped.code = "PENDING_OUTPUT_RECOVERY";
  wrapped.bookId = String(task.bookId);
  return wrapped;
}

async function completePendingOutput(task) {
  let pending = readPendingFeishu(task.bookId) || task;
  try {
    const feishu = await resolveFeishu(path.join(rootDir, FEISHU_FILE));
    const values = await readValues(feishu, `${feishu.sheetId}!A:G`);
    const exactIndex = exactOutputRowIndex(values, pending);
    let row = exactIndex >= 1 ? exactIndex + 1 : null;

    if (row) {
      if (!pending.feishuWrittenAt) {
        pending = savePendingFeishu({ ...pending, row, feishuWrittenAt: new Date().toISOString() });
        log(`检测到飞书已存在同一推广结果，继续恢复后续步骤：${pending.bookId}`);
      }
      ensureTodayOutput(pending.bookId, pending.writeBookName);
    } else {
      const duplicate = !pending.force && (
        hasBookNameInRows(values, pending.bookName) || hasBookNameInRows(values, pending.feishuBookName)
      );
      if (duplicate) {
        log(`飞书已有重复书名，推广后恢复任务标记完成并跳过：${pending.bookName} / ${pending.bookId}`);
        removePendingFeishu(pending.bookId);
        updatePendingStatus();
        return { bookId: pending.bookId, bookName: pending.bookName, duplicateSkipped: true, startPage: pending.startPage, startParam: pending.startParam };
      }

      row = firstEmptyAtoGRow(values);
      await writeValues(feishu, `${feishu.sheetId}!A${row}:G${row}`, [
        buildCompleteFeishuRow({
          date: pending.date,
          bookName: pending.writeBookName,
          labelText: pending.labelText,
          startPage: pending.startPage,
          startParam: pending.startParam,
        }),
      ]);
      pending = savePendingFeishu({ ...pending, row, feishuWrittenAt: new Date().toISOString() });
      log(`飞书完整信息已写入：${feishu.sheetId}!A${row}:G${row}，书名：${pending.writeBookName}`);
      try { recordTodayOutput(pending.bookId, pending.writeBookName); } catch (error) { log(`今日出书计数更新失败：${error.message}`); }
    }

    if (!pending.novelSavedAt) {
      ensureDir(novelOriginalDir);
      ensureDir(movableNovelDir);
      fs.writeFileSync(pending.bookFile, pending.novelText, "utf8");
      fs.writeFileSync(pending.movableFile, pending.novelText, "utf8");
      pending = savePendingFeishu({ ...pending, novelSavedAt: new Date().toISOString() });
      log(`小说文本已保存：${pending.bookFile}`);
    }

    if (!pending.wechatSentAt && !pending.wechatSkippedAt) {
      if (isWechatSendEnabled(readTextFile(WECHAT_SEND_SWITCH_FILE, false))) {
        await sendWechatFile(readTextFile(WECHAT_FILE), pending.bookFile);
        pending = savePendingFeishu({ ...pending, wechatSentAt: new Date().toISOString() });
        log("企业微信已发送小说文本");
      } else {
        pending = savePendingFeishu({ ...pending, wechatSkippedAt: new Date().toISOString() });
        log("企业微信发送已关闭，跳过小说文本发送");
      }
    }

    removePendingFeishu(pending.bookId);
    updatePendingStatus();
    return {
      bookId: pending.bookId,
      bookName: pending.bookName,
      row,
      bookFile: pending.bookFile,
      movableFile: pending.movableFile,
      labels: pending.labels,
      startPage: pending.startPage,
      startParam: pending.startParam,
      recovered: Boolean(task.feishuWrittenAt || exactIndex >= 1),
    };
  } catch (error) {
    updatePendingStatus();
    throw pendingOutputError(pending, error);
  }
}

async function retryPendingOutputs() {
  const tasks = listPendingFeishu();
  if (tasks.length) log(`发现推广后待恢复任务 ${tasks.length} 本`);
  const results = [];
  for (const task of tasks) {
    try {
      results.push(await processBook(task.bookId));
    } catch (error) {
      log(`推广后待恢复仍未完成：${task.bookId}，原因：${error.message}`);
    }
  }
  updatePendingStatus();
  return results;
}

async function processBookUnlocked(bookId, existingPageContext, options = {}) {
  const pending = readPendingFeishu(bookId);
  if (pending) {
    log(`继续推广后待恢复任务：${bookId}`);
    return completePendingOutput(pending);
  }
  const ownContext = !existingPageContext;
  const { context, page, origin } = existingPageContext || (await openContext());
  try {
    log(`开始处理书籍：${bookId}`);
    await searchBookAndOpenInfo(page, origin, bookId);
    const book = await extractBookInfo(page);
    if (!book.name) throw new Error(`未读取到书名：${bookId}`);

    const feishu = await resolveFeishu(path.join(rootDir, FEISHU_FILE));
    const existingValues = await readValues(feishu, `${feishu.sheetId}!A:G`);
    const feishuBookName = typeof toFeishuBookName === "function" ? toFeishuBookName(book.name) : book.name;
    if (!options.force && (hasBookNameInRows(existingValues, book.name) || hasBookNameInRows(existingValues, feishuBookName))) {
      log(`飞书已有重复书名，跳过写入并标记完成：${book.name} / ${bookId}`);
      return { bookId, bookName: book.name, duplicateSkipped: true };
    }

    const chapters = await listChapters(page);
    const downloadable = pickDownloadableChapters(chapters);
    if (!downloadable.length) throw new Error(`没有可下载章节：${book.name}`);

    const parts = [];
    for (const chapter of downloadable) {
      log(`读取章节：${chapter.title}`);
      parts.push(await readChapterText(page, origin, chapter.href));
    }

    const novelText = cleanNovelText(parts.join("\n"));
    const fileName = `${safeFileName(book.name)}.txt`;
    const bookFile = path.join(novelOriginalDir, fileName);
    const movableFile = path.join(movableNovelDir, fileName);

    const labels = await labelsForBook(bookId, book, novelText);
    const labelText = formatFeishuLabel(feishuBookName, labels);

    await searchBookAndOpenInfo(page, origin, bookId);
    const refreshedChapters = await listChapters(page);
    const firstReferral = refreshedChapters.find((chapter) => chapter.referralHref)?.referralHref;
    if (!firstReferral) throw new Error(`没有找到第1章获取推广链接入口：${book.name}`);
    await openFirstChapterReferral(page, origin, firstReferral);
    await createReferralLink(page, readTextFile(RESOURCE_ID_FILE));
    log("推广链接已生成");

    const latest = await waitLatestReferral(page, origin, book.name, { bookId });
    if (!latest?.startPage || !latest?.startParam) throw new Error(`未读取到最新推广链接启动页/参数：${book.name}`);

    const values = await readValues(feishu, `${feishu.sheetId}!A:G`);
    if (!options.force && (hasBookNameInRows(values, book.name) || hasBookNameInRows(values, feishuBookName))) {
      log(`飞书已有重复书名，跳过写入并标记完成：${book.name} / ${bookId}`);
      return { bookId, bookName: book.name, duplicateSkipped: true, bookFile, movableFile, labels, startPage: latest.startPage, startParam: latest.startParam };
    }
    const writeBookName = options.force ? nextManualBookName(values, feishuBookName) : feishuBookName;
    const task = savePendingFeishu({
      bookId,
      bookName: book.name,
      feishuBookName,
      writeBookName,
      date: todayChinaDate(),
      labelText,
      labels,
      startPage: latest.startPage,
      startParam: latest.startParam,
      novelText,
      bookFile,
      movableFile,
      force: Boolean(options.force),
    });
    updatePendingStatus();
    log(`推广后待恢复点已保存：${bookId}`);
    return await completePendingOutput(task);
  } catch (error) {
    ensureDir(failedDir);
    fs.writeFileSync(path.join(failedDir, `${bookId}-${Date.now()}.txt`), error.stack || error.message, "utf8");
    throw error;
  } finally {
    if (ownContext) await context.close().catch(() => {});
  }
}

async function processBook(bookId, existingPageContext, options = {}) {
  const locked = await withLock(lockFileForBook(bookId), { kind: "book", bookId }, async () => processBookUnlocked(bookId, existingPageContext, options));
  if (!locked.acquired) {
    log(`书籍正在被其他进程处理，跳过本次：${bookId}，PID：${locked.lock.activePid || "unknown"}`);
    return { bookId, lockedSkipped: true, activePid: locked.lock.activePid };
  }
  return locked.result;
}

if (require.main === module) {
  const bookId = process.argv[2];
  if (!bookId) {
    console.error("用法：node src\\run-book.js <书籍ID>");
    process.exit(1);
  }
  processBook(bookId, null, { force: true }).catch((error) => {
    log(`处理失败：${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { completePendingOutput, isPendingOutputError, processBook, retryPendingOutputs };
