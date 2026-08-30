const RETRY_MS = 60 * 60 * 1000;

function buildFailureQueueItem(book, item, reason, now = new Date()) {
  const failCount = (item?.failCount || 0) + 1;
  return {
    bookId: book.id,
    bookName: book.name,
    source: book.source,
    rowDate: book.rowDate,
    discoveredAt: item?.discoveredAt || now.toISOString(),
    status: "retrying",
    failCount,
    reason: String(reason || "").slice(0, 1000),
    lastFailedAt: now.toISOString(),
    nextRetryAt: new Date(now.getTime() + RETRY_MS).toISOString(),
  };
}

module.exports = { buildFailureQueueItem, RETRY_MS };
