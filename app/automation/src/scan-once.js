const { isBrowserSessionError, openContext } = require("./browser");
const { log } = require("./logger");
const { flushWechatNotifications, notifyOrQueueWechat } = require("./notification-utils");
const { isPendingOutputError, processBook, retryPendingOutputs } = require("./run-book");
const { MAX_FAILED_RETRIES_PER_SCAN, SCAN_INTERVAL_MS, SCAN_PAGES } = require("./settings");
const { listPendingFeishu } = require("./pending-feishu");
const { formatChinaTime, readAllOutputBookIds, readTodayDetectedBooks, readTodayOutputCount, recordTodayDetectedBooks, writeStatusPanel } = require("./status-utils");
const { isTodayChina, todayChinaDate } = require("./platform-utils");
const { clickNextPromotionPage, openPromotionList, readCurrentPromotionRows } = require("./platform-browser");
const {
  appendScanHistory,
  buildFailedQueueState,
  dueFailedBooks,
  expireStaleFailedBooks,
  markPendingBookAttempted,
  mergePendingBooks,
  readFailedQueue,
  readPendingQueue,
  readSeenBookIds,
  removeFailedBook,
  removePendingBook,
  writeFailedQueue,
  writePendingQueue,
  writeSeenBookIds,
} = require("./state");

function failureReason(error) {
  return String(error?.message || error || "").slice(0, 1000);
}

async function notifyTerminalFailures(queueState, previousCount) {
  const terminal = queueState.terminalFailures.slice(previousCount);
  for (const item of terminal) {
    await notifyOrQueueWechat(`彻底失败书籍id${item.bookId}失败原因${item.reason}`);
  }
}

function bookIdOf(bookOrId) {
  return String(typeof bookOrId === "object" ? bookOrId.id || bookOrId.bookId : bookOrId);
}

async function processWithFailureQueue(bookOrId, browserContext, queueState) {
  const bookId = bookIdOf(bookOrId);
  const beforeTerminalCount = queueState.terminalFailures.length;
  try {
    const result = await processBook(bookId, browserContext);
    if (result?.lockedSkipped) {
      log(`书籍由其他进程处理中，本轮不修改失败队列：${bookId}`);
      return false;
    }
    writeFailedQueue(removeFailedBook(queueState, bookId));
    log(`失败队列已移除成功书籍：${bookId}`);
    return true;
  } catch (error) {
    if (isBrowserSessionError(error)) {
      log(`浏览器全局故障，本轮停止且不增加书籍失败次数：${failureReason(error)}`);
      throw error;
    }
    if (isPendingOutputError(error)) {
      log(`推广后任务已进入待恢复区，不增加书籍失败次数：${bookId}，原因：${failureReason(error)}`);
      return false;
    }
    const nextQueue = buildFailedQueueState(queueState, bookId, failureReason(error), new Date(), typeof bookOrId === "object" ? bookOrId : {});
    writeFailedQueue(nextQueue);
    await notifyTerminalFailures(nextQueue, beforeTerminalCount);
    log(`书籍处理失败，已记录失败队列：${bookId}，原因：${failureReason(error)}`);
    return false;
  }
}

async function retryDueFailures(browserContext, queueState, now = new Date()) {
  queueState = expireStaleFailedBooks(queueState);

  const dueItems = dueFailedBooks(queueState, now).slice(0, MAX_FAILED_RETRIES_PER_SCAN);
  if (dueItems.length) log(`本轮重试失败队列 ${dueItems.length}/${dueFailedBooks(queueState, now).length} 本`);
  for (const item of dueItems) {
    log(`重试失败队列书籍：${item.bookId}，当前失败次数：${item.failCount}`);
    await processWithFailureQueue(item, browserContext, queueState);
    queueState = readFailedQueue();
  }
  return queueState;
}

function pendingOutputIds() {
  return new Set(listPendingFeishu().map((item) => String(item.bookId)));
}

function failedBookIds(state) {
  return new Set([
    ...Object.keys(state.queue || {}),
    ...(state.terminalFailures || []).map((item) => String(item.bookId)),
  ]);
}

function reconcilePendingQueue(todayRows, now = new Date()) {
  const failed = readFailedQueue();
  const blocked = new Set([
    ...readAllOutputBookIds(),
    ...failedBookIds(failed),
    ...pendingOutputIds(),
  ]);
  const detected = readTodayDetectedBooks(now).map((item) => ({
    id: item.bookId,
    name: item.bookName || "",
    listedAt: item.listedAt || item.sourceDate || "",
    source: item.source || "platform",
    sourceDate: item.sourceDate,
    discoveredAt: item.at,
  }));
  const candidates = [...detected, ...(todayRows || []).map((book) => ({
    ...book,
    source: book.source || "platform",
    sourceDate: String(book.listedAt || "").slice(0, 10),
    discoveredAt: now.toISOString(),
  }))].filter((book) => !blocked.has(String(book.id)));
  const current = readPendingQueue();
  const kept = { ...current, books: current.books.filter((book) => !blocked.has(String(book.id))) };
  const next = mergePendingBooks(kept, candidates, now);
  writePendingQueue(next);
  return next;
}

async function processPendingQueue() {
  let queue = readPendingQueue();
  for (const book of [...queue.books]) {
    queue = markPendingBookAttempted(readPendingQueue(), book.id);
    writePendingQueue(queue);
    const succeeded = await processWithFailureQueue(book, null, readFailedQueue());
    const failed = failedBookIds(readFailedQueue());
    const pendingOutputs = pendingOutputIds();
    if (succeeded || failed.has(String(book.id)) || pendingOutputs.has(String(book.id))) {
      writePendingQueue(removePendingBook(readPendingQueue(), book.id));
    }
  }
}

function updateScanStatus(scannedCount, lastScanTodayBookCount, todayBookCount, newBookCount, scanTime = new Date()) {
  const failedQueue = readFailedQueue();
  const failedItems = Object.values(failedQueue.queue || {});
  const latestFailure = failedItems.sort((a, b) => Date.parse(b.lastFailedAt || 0) - Date.parse(a.lastFailedAt || 0))[0];
  writeStatusPanel({
    lastScanAt: formatChinaTime(scanTime),
    scannedBooks: scannedCount,
    lastScanTodayBooks: lastScanTodayBookCount,
    todayBooks: todayBookCount,
    // A scan replaces the snapshot, so preserve the independently recorded success count.
    todayOutputCount: readTodayOutputCount(scanTime),
    newBooks: newBookCount,
    nextScanAt: formatChinaTime(new Date(scanTime.getTime() + SCAN_INTERVAL_MS)),
    scanPages: SCAN_PAGES,
    failedQueueCount: failedItems.length,
    maxFailCount: failedItems.reduce((max, item) => Math.max(max, item.failCount || 0), 0),
    lastFailureReason: latestFailure?.reason || "",
  });
}

async function scanOnce() {
  let failedQueue = readFailedQueue();
  const seen = readSeenBookIds();
  const nextSeen = new Set(seen);
  const scanned = [];
  const todayRows = [];
  const newToday = [];
  const today = todayChinaDate();
  await flushWechatNotifications();
  await retryPendingOutputs();
  reconcilePendingQueue([]);
  await processPendingQueue();

  const { context, page, origin } = await openContext();
  try {
    await openPromotionList(page, origin);
    for (let pageNo = 1; pageNo <= SCAN_PAGES; pageNo += 1) {
      log(`扫描推广小说第 ${pageNo}/${SCAN_PAGES} 页`);
      const rows = await readCurrentPromotionRows(page);
      for (const row of rows) {
        scanned.push(row);
        const isToday = isTodayChina(row.listedAt, today);
        if (isToday) todayRows.push(row);
        if (!seen.has(row.id) && isToday) newToday.push(row);
        nextSeen.add(row.id);
      }
      if (pageNo < SCAN_PAGES) {
        const hasNext = await clickNextPromotionPage(page);
        if (!hasNext) {
          log(`第 ${pageNo} 页后没有下一页，提前结束扫描`);
          break;
        }
      }
    }
    writeSeenBookIds(nextSeen);
    appendScanHistory({ at: new Date().toISOString(), pages: SCAN_PAGES, scanned: scanned.length, today: todayRows.length, newToday: newToday.length, ids: newToday.map((book) => book.id) });
    const todayDetectedCount = recordTodayDetectedBooks(todayRows.map((row) => ({
      bookId: row.id,
      source: "platform",
      sourceDate: today,
      bookName: row.name || "",
      listedAt: row.listedAt || "",
    })));
    reconcilePendingQueue(todayRows);
    updateScanStatus(scanned.length, todayRows.length, todayDetectedCount, newToday.length);
    log(`扫描完成：共 ${scanned.length} 条，今天书 ${todayRows.length} 本，今天新书 ${newToday.length} 本`);
  } finally {
    await context.close().catch(() => {});
  }

  await processPendingQueue();
  failedQueue = await retryDueFailures(null, readFailedQueue());
  writeStatusPanel({ failedQueueCount: Object.keys(failedQueue.queue || {}).length });
  return { scanned: scanned.length, newToday };
}

if (require.main === module) {
  scanOnce().catch(async (error) => {
    log(`运行失败：${error.stack || error.message}`);
    await notifyOrQueueWechat(`点重自动化全局错误：${failureReason(error)}`).catch((notifyError) => log(`企业微信通知入队失败：${notifyError.message}`));
    process.exitCode = 1;
  });
}

module.exports = { failureReason, processPendingQueue, processWithFailureQueue, reconcilePendingQueue, retryDueFailures, scanOnce, updateScanStatus };
