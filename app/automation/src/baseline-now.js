const { openContext } = require("./browser");
const { log } = require("./logger");
const { SCAN_INTERVAL_MS, SCAN_PAGES } = require("./settings");
const { formatChinaTime, writeStatusPanel } = require("./status-utils");
const { clickNextPromotionPage, openPromotionList, readCurrentPromotionRows } = require("./platform-browser");
const { appendScanHistory, readSeenBookIds, writeSeenBookIds } = require("./state");

async function baselineNow() {
  const { context, page, origin } = await openContext();
  const seen = readSeenBookIds();
  const scanned = [];
  try {
    await openPromotionList(page, origin);
    for (let pageNo = 1; pageNo <= SCAN_PAGES; pageNo += 1) {
      log(`一键基准扫描第 ${pageNo}/${SCAN_PAGES} 页`);
      const rows = await readCurrentPromotionRows(page);
      for (const row of rows) {
        scanned.push(row);
        seen.add(row.id);
      }
      if (pageNo < SCAN_PAGES) {
        const hasNext = await clickNextPromotionPage(page);
        if (!hasNext) break;
      }
    }
    writeSeenBookIds(seen);
    const now = new Date();
    writeStatusPanel({
      lastScanAt: formatChinaTime(now),
      scannedBooks: scanned.length,
      newBooks: 0,
      nextScanAt: formatChinaTime(new Date(now.getTime() + SCAN_INTERVAL_MS)),
      scanPages: SCAN_PAGES,
    });
    appendScanHistory({ at: new Date().toISOString(), type: "baseline", pages: SCAN_PAGES, scanned: scanned.length, ids: scanned.map((book) => book.id) });
    log(`一键基准完成：已标记 ${scanned.length} 本为旧书`);
    return { scanned: scanned.length };
  } finally {
    await context.close().catch(() => {});
  }
}

if (require.main === module) {
  baselineNow().catch((error) => {
    log(`一键基准失败：${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { baselineNow };
