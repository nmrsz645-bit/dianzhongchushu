const fs = require("fs");
const path = require("path");
const { dataDir, ensureDir, rootDir, writeTextFile } = require("./paths");

const OUTPUT_HISTORY_FILE = path.join(dataDir, "output_history.jsonl");
const DETECTION_HISTORY_FILE = path.join(dataDir, "today_detected_books.jsonl");
const STATUS_SNAPSHOT_FILE = path.join(dataDir, "status_snapshot.json");
const PENDING_QUEUE_FILE = path.join(dataDir, "queue.json");
const FAILED_QUEUE_FILE = path.join(dataDir, "failed_queue.json");
const PENDING_FEISHU_DIR = path.join(dataDir, "pending_feishu");
const FALLBACK_STATE_FILE = path.join(rootDir, "\u515c\u5e95", "\u515c\u5e95\u72b6\u6001.json");
const TERMINAL_DETAILS_FILE = path.join(dataDir, "terminal_failure_details.tsv");
const STATUS_FILE = path.join(rootDir, "\u72b6\u6001\u9762\u677f.txt");

function formatChinaTime(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function chinaDate(date = new Date()) {
  return formatChinaTime(date).slice(0, 10);
}

function millisecondsUntilNextChinaMidnight(now = new Date()) {
  const [year, month, day] = chinaDate(now).split("-").map(Number);
  return Math.max(1000, Date.UTC(year, month - 1, day + 1, -8, 0, 0) - now.getTime());
}

function readJsonLines(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

function appendJsonLine(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function readTodayOutputCount(now = new Date(), file = OUTPUT_HISTORY_FILE) {
  const today = chinaDate(now);
  return new Set(readJsonLines(file).filter((item) => item.date === today).map((item) => String(item.bookId))).size;
}

function readAllOutputBookIds(file = OUTPUT_HISTORY_FILE) {
  return new Set(readJsonLines(file).map((item) => String(item.bookId || "")).filter(Boolean));
}

function hasTodayOutput(bookId, now = new Date(), file = OUTPUT_HISTORY_FILE) {
  const today = chinaDate(now);
  const target = String(bookId);
  return readJsonLines(file).some((item) => item.date === today && String(item.bookId) === target);
}

function readTodayDetectedBooks(now = new Date(), file = DETECTION_HISTORY_FILE) {
  const today = chinaDate(now);
  const books = new Map();
  for (const item of readJsonLines(file)) {
    if ((item.sourceDate || item.date) !== today) continue;
    const bookId = String(item.bookId || "").trim();
    if (!bookId) continue;
    const previous = books.get(bookId) || {};
    books.set(bookId, {
      ...item,
      ...previous,
      bookId,
      source: previous.source || item.source || "platform",
      sourceDate: today,
      bookName: previous.bookName || item.bookName || "",
      listedAt: previous.listedAt || item.listedAt || "",
      at: previous.at || item.at || "",
    });
  }
  return [...books.values()];
}

function readTodayDetectedCount(now = new Date(), file = DETECTION_HISTORY_FILE) {
  return readTodayDetectedBooks(now, file).length;
}

function normalizeDetectedBook(value, today) {
  if (value && typeof value === "object") {
    return {
      bookId: String(value.bookId || value.id || "").trim(),
      source: String(value.source || "platform").trim(),
      sourceDate: String(value.sourceDate || value.date || today).slice(0, 10),
      bookName: String(value.bookName || value.name || "").trim(),
      listedAt: String(value.listedAt || "").trim(),
    };
  }
  return { bookId: String(value || "").trim(), source: "platform", sourceDate: today, bookName: "", listedAt: "" };
}

function recordTodayDetectedBooks(bookIds, now = new Date(), file = DETECTION_HISTORY_FILE) {
  const today = chinaDate(now);
  const known = new Set(readJsonLines(file)
    .filter((item) => (item.sourceDate || item.date) === today)
    .map((item) => String(item.bookId)));
  for (const value of bookIds || []) {
    const item = normalizeDetectedBook(value, today);
    if (!item.bookId || item.sourceDate !== today || known.has(item.bookId)) continue;
    known.add(item.bookId);
    appendJsonLine(file, { at: now.toISOString(), date: today, ...item });
  }
  return known.size;
}

function readStatusSnapshot() {
  try { return JSON.parse(fs.readFileSync(STATUS_SNAPSHOT_FILE, "utf8")); } catch { return {}; }
}

function readJsonFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function pendingFeishuIds(dir) {
  try {
    return new Set(fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => path.basename(name, ".json")));
  } catch {
    return new Set();
  }
}

function activityDate(item) {
  const value = String(item?.rowDate || item?.listedAt || item?.sourceDate || "").trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function isTodayActivity(item, bookId, today, detectedIds) {
  const date = activityDate(item);
  return date ? date === today : detectedIds.has(String(bookId));
}

function terminalFailureDetails(now = new Date(), options = {}) {
  const today = chinaDate(now);
  const detected = readTodayDetectedBooks(now, options.detectionFile || DETECTION_HISTORY_FILE);
  const detectedById = new Map(detected.map((item) => [String(item.bookId), item]));
  const detectedIds = new Set(detectedById.keys());
  const failedState = readJsonFile(options.failedQueueFile || FAILED_QUEUE_FILE, { queue: {}, terminalFailures: [] });
  const fallbackState = readJsonFile(options.fallbackStateFile || FALLBACK_STATE_FILE, { books: {}, terminalFailures: [] });
  const pendingState = readJsonFile(options.pendingQueueFile || PENDING_QUEUE_FILE, { books: [] });
  const completed = readAllOutputBookIds(options.outputFile || OUTPUT_HISTORY_FILE);
  const activeToday = new Set();
  for (const [bookId, item] of Object.entries(failedState.queue || {})) {
    if (isTodayActivity(item, bookId, today, detectedIds)) activeToday.add(String(bookId));
  }
  for (const book of pendingState.books || []) {
    const bookId = String(book?.id || book?.bookId || "").trim();
    if (bookId && isTodayActivity(book, bookId, today, detectedIds)) activeToday.add(bookId);
  }
  for (const [bookId, book] of Object.entries(fallbackState.books || {})) {
    if (book?.successAt) completed.add(String(bookId));
    else if (isTodayActivity(book, bookId, today, detectedIds)) activeToday.add(String(bookId));
  }
  for (const bookId of pendingFeishuIds(options.pendingFeishuDir || PENDING_FEISHU_DIR)) activeToday.add(bookId);
  const details = new Map();
  const add = (item, source, fallbackBook = {}) => {
    const bookId = String(item?.bookId || fallbackBook?.bookId || "").trim();
    if (!bookId || completed.has(bookId) || activeToday.has(bookId)) return;
    const detectedBook = detectedById.get(bookId) || {};
    const value = {
      discoveredAt: item.discoveredAt || fallbackBook.discoveredAt || detectedBook.at || item.listedAt || fallbackBook.rowDate || "",
      terminalFailedAt: item.failedAt || item.terminalFailedAt || item.lastFailedAt || "",
      bookName: item.bookName || fallbackBook.bookName || detectedBook.bookName || "",
      bookId,
      reason: item.reason || fallbackBook.reason || "",
      failCount: Number(item.failCount || fallbackBook.failCount || 0),
      source: item.source || fallbackBook.source || detectedBook.source || source,
    };
    const previous = details.get(bookId);
    if (!previous || Date.parse(value.terminalFailedAt || 0) >= Date.parse(previous.terminalFailedAt || 0)) details.set(bookId, value);
  };
  for (const item of failedState.terminalFailures || []) add(item, "platform");
  for (const [bookId, item] of Object.entries(failedState.queue || {})) {
    const date = activityDate(item);
    if (date && date < today) add({ ...item, bookId: item?.bookId || bookId }, "platform");
  }
  for (const item of fallbackState.terminalFailures || []) add(item, "fallback", fallbackState.books?.[String(item.bookId)] || {});
  for (const [bookId, book] of Object.entries(fallbackState.books || {})) {
    const date = activityDate(book);
    if (!book?.successAt && date && date < today) add({ ...book, bookId: book?.bookId || bookId }, "fallback", book);
  }
  return [...details.values()].sort((a, b) => Date.parse(b.terminalFailedAt || 0) - Date.parse(a.terminalFailedAt || 0));
}

function operationalCounts(now = new Date(), options = {}) {
  const outputFile = options.outputFile || OUTPUT_HISTORY_FILE;
  const allOutputIds = readAllOutputBookIds(outputFile);
  const pendingState = readJsonFile(options.pendingQueueFile || PENDING_QUEUE_FILE, { books: [] });
  const failedState = readJsonFile(options.failedQueueFile || FAILED_QUEUE_FILE, { queue: {}, terminalFailures: [] });
  const fallbackState = readJsonFile(options.fallbackStateFile || FALLBACK_STATE_FILE, { books: {}, terminalFailures: [] });
  const pendingOutput = pendingFeishuIds(options.pendingFeishuDir || PENDING_FEISHU_DIR);
  const today = chinaDate(now);
  const detectedIds = new Set(readTodayDetectedBooks(now, options.detectionFile || DETECTION_HISTORY_FILE).map((item) => String(item.bookId)));
  const terminal = new Set(terminalFailureDetails(now, options).map((item) => item.bookId));
  const completed = new Set(allOutputIds);
  const pending = new Set();
  const retrying = new Set(pendingOutput);
  for (const [bookId, item] of Object.entries(failedState.queue || {})) {
    if (isTodayActivity(item, bookId, today, detectedIds)) retrying.add(String(bookId));
  }

  for (const book of pendingState.books || []) {
    const bookId = String(book?.id || book?.bookId || "").trim();
    if (!bookId || !isTodayActivity(book, bookId, today, detectedIds)) continue;
    if (book.attemptStartedAt) retrying.add(bookId);
    else pending.add(bookId);
  }
  for (const [bookId, book] of Object.entries(fallbackState.books || {})) {
    if (book?.successAt) completed.add(String(bookId));
    else if (isTodayActivity(book, bookId, today, detectedIds) && (book?.failCount || 0) > 0) retrying.add(String(bookId));
    else if (isTodayActivity(book, bookId, today, detectedIds) && (book?.status === "pending" || book?.discoveredAt)) pending.add(String(bookId));
  }
  for (const bookId of [...completed, ...terminal]) {
    pending.delete(bookId);
    retrying.delete(bookId);
  }
  for (const bookId of retrying) pending.delete(bookId);
  return {
    todayBooks: readTodayDetectedCount(now, options.detectionFile || DETECTION_HISTORY_FILE),
    todayOutputCount: readTodayOutputCount(now, outputFile),
    pendingCount: pending.size,
    retryQueueCount: retrying.size,
    terminalFailureCount: terminal.size,
    pendingFeishuCount: pendingOutput.size,
  };
}

function sanitizeTsv(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function writeTerminalFailureDetails(details, file = TERMINAL_DETAILS_FILE) {
  const rows = ["发现时间\t彻底失败时间\t书籍名称\t书籍ID\t失败原因\t尝试次数\t来源"];
  for (const item of details) {
    rows.push([
      item.discoveredAt,
      item.terminalFailedAt,
      item.bookName,
      item.bookId,
      item.reason,
      item.failCount,
      item.source,
    ].map(sanitizeTsv).join("\t"));
  }
  writeTextFile(file, `${rows.join("\r\n")}\r\n`);
}

function statusPanelText(status) {
  return [
    "\u70b9\u91cd\u81ea\u52a8\u5316\u72b6\u6001\u9762\u677f",
    "",
    `\u4e0a\u6b21\u68c0\u6d4b\u65f6\u95f4\uff1a${status.lastScanAt || "-"}`,
    `\u672c\u8f6e\u626b\u63cf\u4e66\u7c4d\u6570\u91cf\uff1a${status.scannedBooks ?? 0}`,
    `\u672c\u8f6e\u5224\u5b9a\u5f53\u65e5\u4e0a\u67b6\uff1a${status.lastScanTodayBooks ?? 0}`,
    `\u4eca\u65e5\u53d1\u73b0\u603b\u4e66\u7c4d\uff1a${status.todayBooks ?? readTodayDetectedCount()}`,
    `\u672c\u8f6e\u53d1\u73b0\u65b0\u4e66\uff1a${status.newBooks ?? 0}`,
    `\u4eca\u65e5\u5b9e\u9645\u51fa\u4e66\uff1a${status.todayOutputCount ?? readTodayOutputCount()}`,
    `\u5f85\u5904\u7406\u4e66\u7c4d\uff1a${status.pendingCount ?? 0}`,
    `\u91cd\u8bd5\u961f\u5217\uff1a${status.retryQueueCount ?? 0}`,
    `\u5f7b\u5e95\u5931\u8d25\u961f\u5217\uff1a${status.terminalFailureCount ?? 0}`,
    `\u4e0b\u6b21\u68c0\u6d4b\u65f6\u95f4\uff1a${status.nextScanAt || "-"}`,
    `\u68c0\u6d4b\u9875\u6570\uff1a${status.scanPages ?? 0}`,
    `\u5931\u8d25\u961f\u5217\u6570\u91cf\uff1a${status.failedQueueCount ?? 0}`,
    `\u6700\u9ad8\u5931\u8d25\u6b21\u6570\uff1a${status.maxFailCount ?? 0}`,
    `\u6700\u8fd1\u5931\u8d25\u539f\u56e0\uff1a${status.lastFailureReason || "-"}`,
    `\u98de\u4e66\u5f85\u5199\u6062\u590d\u6570\uff1a${status.pendingFeishuCount ?? 0}`,
    `\u8fd0\u884c\u5065\u5eb7\u72b6\u6001\uff1a${status.runtimeHealth || "-"}`,
    `\u6700\u8fd1\u5168\u5c40\u9519\u8bef\uff1a${status.lastGlobalError || "-"}`,
  ].join("\n");
}

function writeStatusPanel(status, now = new Date()) {
  const details = terminalFailureDetails(now);
  const snapshot = { ...readStatusSnapshot(), ...status, ...operationalCounts(now), statsDate: chinaDate(now) };
  ensureDir(dataDir);
  fs.writeFileSync(STATUS_SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf8");
  writeTerminalFailureDetails(details);
  writeTextFile(STATUS_FILE, statusPanelText(snapshot));
}

function updateStatusFields(fields) {
  writeStatusPanel(fields || {});
}

function refreshDailyStatus(now = new Date()) {
  const snapshot = readStatusSnapshot();
  writeStatusPanel({
    ...snapshot,
    todayBooks: readTodayDetectedCount(now),
    todayOutputCount: readTodayOutputCount(now),
    statsDate: chinaDate(now),
  }, now);
}

function recordTodayOutput(bookId, bookName, now = new Date()) {
  appendJsonLine(OUTPUT_HISTORY_FILE, {
    at: now.toISOString(),
    date: chinaDate(now),
    bookId: String(bookId),
    bookName: String(bookName || ""),
  });
  refreshDailyStatus(now);
  return readTodayOutputCount(now);
}

function ensureTodayOutput(bookId, bookName, now = new Date()) {
  if (!hasTodayOutput(bookId, now)) return recordTodayOutput(bookId, bookName, now);
  refreshDailyStatus(now);
  return readTodayOutputCount(now);
}

module.exports = {
  formatChinaTime,
  ensureTodayOutput,
  hasTodayOutput,
  millisecondsUntilNextChinaMidnight,
  operationalCounts,
  readAllOutputBookIds,
  readTodayDetectedBooks,
  readTodayDetectedCount,
  readTodayOutputCount,
  recordTodayDetectedBooks,
  recordTodayOutput,
  refreshDailyStatus,
  statusPanelText,
  terminalFailureDetails,
  updateStatusFields,
  writeStatusPanel,
};
