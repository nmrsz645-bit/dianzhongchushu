function normalizeCells(cells) {
  return Array.from(cells || []).map((cell) => String(cell || "").trim());
}

function parseBookRowFromCells(cells) {
  const normalized = normalizeCells(cells);
  const idIndex = normalized.findIndex((cell) => /^\d{6,}$/.test(cell));
  if (idIndex === -1) return null;

  const listedAt = normalized.find((cell) => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(cell)) || "";
  const name = normalized[idIndex + 2] || normalized[idIndex + 1] || "";
  return { id: normalized[idIndex], name, listedAt };
}

function parseBookRowsFromCellRows(cellRows) {
  return Array.from(cellRows || []).map(parseBookRowFromCells).filter(Boolean);
}

function parseBookRowsFromTableText(text) {
  const cellRows = String(text || "").split(/\r?\n/).map((line) => line.split("\t"));
  return parseBookRowsFromCellRows(cellRows);
}

function extractFirstDateTime(text) {
  return String(text || "").match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/)?.[0] || "";
}

function pickDownloadableChapters(chapters) {
  return chapters.filter((chapter) => chapter.downloadText === "\u4e0b\u8f7d" || chapter.downloadText === "涓嬭浇");
}

function referralPartsFromRow(row) {
  const candidates = [
    ...Array.from(row.links || []),
    ...String(row.text || "").split(/\s+/),
  ].map((text) => String(text || "").trim()).filter(Boolean);
  const startPage = candidates.some((text) => text.includes("pages/novel_plugin/index")) ? "pages/novel_plugin/index" : "";
  const startParam = candidates.map((text) => text.match(/bookId=[^\s]+/)?.[0] || "").find(Boolean) || "";
  return { startPage, startParam, rowText: row.text || "" };
}

function pickReferralFromRows(rows, expectedBookName, expectedBookId = "") {
  const expected = String(expectedBookName || "").trim();
  const expectedId = String(expectedBookId || "").trim();
  const list = Array.from(rows || []);
  const row = list.find((item) => expectedId && String(item?.text || "").includes(`bookId=${expectedId}`))
    || list.find((item) => expected && String(item?.text || "").includes(expected))
    || (!expectedId && !expected ? list.find((item) => {
      const parts = referralPartsFromRow(item || {});
      return parts.startPage && parts.startParam;
    }) : null);
  if (!row) return null;
  return referralPartsFromRow(row);
}

function todayChinaDate() {
  const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isTodayChina(dateText, today = todayChinaDate()) {
  return String(dateText || "").startsWith(today);
}

module.exports = {
  extractFirstDateTime,
  isTodayChina,
  parseBookRowFromCells,
  parseBookRowsFromCellRows,
  parseBookRowsFromTableText,
  pickReferralFromRows,
  pickDownloadableChapters,
  todayChinaDate,
};
