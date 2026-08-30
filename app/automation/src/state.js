const fs = require("fs");
const path = require("path");
const { dataDir, ensureDir } = require("./paths");

const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS = 60 * 60 * 1000;
const FAILED_MAX_COUNT = 24;

function chinaDateText(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function listedAtIsToday(listedAt, today = chinaDateText()) {
  return String(listedAt || "").startsWith(today);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  ensureDir(dataDir);
  const file = path.join(dataDir, name);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function normalizeSeenEntries(state, now = new Date()) {
  if (state && state.entries) return state.entries;
  const seenAt = state?.updatedAt || now.toISOString();
  return Object.fromEntries((state?.ids || []).map((id) => [String(id), seenAt]));
}

function pruneSeenEntries(entries, now = new Date()) {
  const cutoff = now.getTime() - SEEN_TTL_MS;
  return Object.fromEntries(Object.entries(entries || {}).filter(([, seenAt]) => {
    const time = Date.parse(seenAt);
    return Number.isFinite(time) && time >= cutoff;
  }));
}

function buildSeenBookState(ids, currentState = {}, now = new Date()) {
  const nowIso = now.toISOString();
  const currentEntries = pruneSeenEntries(normalizeSeenEntries(currentState, now), now);
  const nextEntries = {};
  for (const id of ids) {
    const key = String(id);
    if (currentEntries[key]) nextEntries[key] = currentEntries[key];
    else nextEntries[key] = nowIso;
  }
  return { ids: Object.keys(nextEntries), entries: nextEntries, updatedAt: nowIso };
}

function readSeenBookIds() {
  const state = readJson("seen_books.json", { ids: [] });
  return new Set(Object.keys(pruneSeenEntries(normalizeSeenEntries(state), new Date())));
}

function writeSeenBookIds(ids) {
  writeJson("seen_books.json", buildSeenBookState(ids, readJson("seen_books.json", { ids: [] })));
}

function appendScanHistory(entry) {
  ensureDir(dataDir);
  fs.appendFileSync(path.join(dataDir, "scan_history.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

function normalizeFailedState(state) {
  return { queue: state?.queue || {}, terminalFailures: state?.terminalFailures || [] };
}

function failedItemDate(item) {
  const value = String(item?.listedAt || item?.sourceDate || item?.rowDate || "").trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function migrateStaleFailedQueueEntries(state, now = new Date()) {
  const next = normalizeFailedState(state);
  const queue = { ...next.queue };
  const terminalFailures = [...next.terminalFailures];
  const terminalIds = new Set(terminalFailures.map((item) => String(item?.bookId || "").trim()).filter(Boolean));
  const today = chinaDateText(now);
  let migrated = 0;
  const prefix = "失败书籍已过当天，不再重试：";
  for (const [key, item] of Object.entries(queue)) {
    const bookId = String(item?.bookId || key).trim();
    const sourceDate = failedItemDate(item);
    if (!bookId || !sourceDate || sourceDate >= today) continue;
    delete queue[key];
    migrated += 1;
    if (terminalIds.has(bookId)) continue;
    const reason = String(item.reason || "");
    terminalFailures.push({
      ...item,
      bookId,
      reason: reason.startsWith(prefix) ? reason : `${prefix}${reason}`,
      failedAt: item.failedAt || item.lastFailedAt || now.toISOString(),
    });
    terminalIds.add(bookId);
  }
  return { state: { queue, terminalFailures }, migrated };
}

function normalizePendingState(state) {
  const books = [];
  const seen = new Set();
  for (const book of state?.books || []) {
    const bookId = String(book?.id || book?.bookId || "").trim();
    if (!bookId || seen.has(bookId)) continue;
    seen.add(bookId);
    books.push({ ...book, id: bookId });
  }
  return { updatedAt: state?.updatedAt || "", books };
}

function mergePendingBooks(state, books, now = new Date()) {
  const next = normalizePendingState(state);
  const byId = new Map(next.books.map((book) => [book.id, book]));
  for (const book of books || []) {
    const bookId = String(book?.id || book?.bookId || "").trim();
    if (!bookId) continue;
    const previous = byId.get(bookId) || {};
    byId.set(bookId, {
      ...book,
      ...previous,
      id: bookId,
      name: previous.name || book.name || book.bookName || "",
      listedAt: previous.listedAt || book.listedAt || "",
      source: previous.source || book.source || "platform",
      sourceDate: previous.sourceDate || book.sourceDate || String(book.listedAt || "").slice(0, 10),
      discoveredAt: previous.discoveredAt || book.discoveredAt || now.toISOString(),
    });
  }
  return { updatedAt: now.toISOString(), books: [...byId.values()] };
}

function markPendingBookAttempted(state, bookId, now = new Date()) {
  const key = String(bookId);
  const next = normalizePendingState(state);
  return {
    updatedAt: now.toISOString(),
    books: next.books.map((book) => book.id === key
      ? { ...book, attemptStartedAt: book.attemptStartedAt || now.toISOString(), lastAttemptStartedAt: now.toISOString() }
      : book),
  };
}

function removePendingBook(state, bookId, now = new Date()) {
  const key = String(bookId);
  const next = normalizePendingState(state);
  return { updatedAt: now.toISOString(), books: next.books.filter((book) => book.id !== key) };
}

function readPendingQueue() {
  return normalizePendingState(readJson("queue.json", { books: [] }));
}

function writePendingQueue(state) {
  writeJson("queue.json", normalizePendingState(state));
}

function buildFailedQueueState(state, bookId, reason, now = new Date(), book = {}) {
  const next = normalizeFailedState(state);
  const key = String(bookId);
  const previous = next.queue[key];
  const failCount = (previous?.failCount || 0) + 1;
  const listedAt = book.listedAt || previous?.listedAt || "";
  const bookName = book.name || book.bookName || previous?.bookName || "";
  const discoveredAt = book.discoveredAt || previous?.discoveredAt || previous?.firstFailedAt || now.toISOString();
  const source = book.source || previous?.source || "platform";
  delete next.queue[key];

  if (failCount >= FAILED_MAX_COUNT) {
    next.terminalFailures = [
      ...next.terminalFailures,
      { bookId: key, bookName, listedAt, discoveredAt, source, reason: String(reason || ""), failCount, failedAt: now.toISOString() },
    ];
  } else {
    next.queue[key] = {
      bookId: key,
      bookName,
      listedAt,
      discoveredAt,
      source,
      reason: String(reason || ""),
      failCount,
      firstFailedAt: previous?.firstFailedAt || now.toISOString(),
      lastFailedAt: now.toISOString(),
      nextRetryAt: new Date(now.getTime() + FAILED_RETRY_MS).toISOString(),
    };
  }
  return { queue: next.queue, terminalFailures: next.terminalFailures };
}

function dueFailedBooks(state, now = new Date()) {
  return Object.values(normalizeFailedState(state).queue).filter(
    (item) => Date.parse(item.nextRetryAt) <= now.getTime()
  );
}

function expireStaleFailedBooks(state) {
  return normalizeFailedState(state);
}

function readFailedQueue() {
  const migrated = migrateStaleFailedQueueEntries(readJson("failed_queue.json", { queue: {}, terminalFailures: [] }));
  if (migrated.migrated) writeJson("failed_queue.json", migrated.state);
  return migrated.state;
}

function writeFailedQueue(state) {
  writeJson("failed_queue.json", normalizeFailedState(state));
}

function removeFailedBook(state, bookId) {
  const next = normalizeFailedState(state);
  delete next.queue[String(bookId)];
  return next;
}

function normalizeNotificationState(state) {
  return { items: state?.items || [] };
}

function buildNotificationQueueState(state, content, now = new Date()) {
  const next = normalizeNotificationState(state);
  return {
    items: [
      ...next.items,
      {
        id: `${now.getTime()}-${next.items.length + 1}`,
        content: String(content || ""),
        createdAt: now.toISOString(),
        lastError: "",
      },
    ],
  };
}

function removeNotification(state, id) {
  return { items: normalizeNotificationState(state).items.filter((item) => item.id !== id) };
}

function markNotificationError(state, id, error) {
  return {
    items: normalizeNotificationState(state).items.map((item) => {
      if (item.id !== id) return item;
      return { ...item, lastError: String(error?.message || error || ""), lastTriedAt: new Date().toISOString() };
    }),
  };
}

function readNotificationQueue() {
  return normalizeNotificationState(readJson("notification_queue.json", { items: [] }));
}

function writeNotificationQueue(state) {
  writeJson("notification_queue.json", normalizeNotificationState(state));
}

module.exports = {
  appendScanHistory,
  buildFailedQueueState,
  buildNotificationQueueState,
  buildSeenBookState,
  dueFailedBooks,
  expireStaleFailedBooks,
  markPendingBookAttempted,
  mergePendingBooks,
  markNotificationError,
  pruneSeenEntries,
  migrateStaleFailedQueueEntries,
  readJson,
  readFailedQueue,
  readNotificationQueue,
  readPendingQueue,
  readSeenBookIds,
  removeFailedBook,
  removeNotification,
  removePendingBook,
  writeFailedQueue,
  writeJson,
  writeNotificationQueue,
  writePendingQueue,
  writeSeenBookIds,
};
