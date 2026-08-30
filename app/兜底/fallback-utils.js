function cellText(cell) {
  if (cell === null || cell === undefined) return "";
  if (Array.isArray(cell)) return cell.map(cellText).filter(Boolean).join(" ");
  if (typeof cell === "object") return cell.text || cell.link || JSON.stringify(cell);
  return String(cell).trim();
}

function excelSerialToChinaDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizedHeader(row) {
  return Array.from(row || []).map((cell) => cellText(cell).replace(/\s+/g, ""));
}

function findHeaderRow(rows) {
  return Array.from(rows || []).findIndex((row) => {
    const header = normalizedHeader(row);
    return (
      (header.includes("书籍ID") && header.includes("书籍名称")) ||
      (header.includes("ID") && header.includes("书名"))
    );
  });
}

function columnIndex(header, names) {
  return names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
}

function parseFallbackBooks(rows, today) {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) return [];
  const header = normalizedHeader(rows[headerIndex]);
  const idIndex = columnIndex(header, ["书籍ID", "ID"]);
  const nameIndex = columnIndex(header, ["书籍名称", "书名"]);
  const dateIndex = columnIndex(header, ["时间", "日期"]);
  if (idIndex < 0 || nameIndex < 0 || dateIndex < 0) return [];

  const books = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const id = cellText(row?.[idIndex]);
    const name = cellText(row?.[nameIndex]);
    const date = excelSerialToChinaDate(cellText(row?.[dateIndex])) || cellText(row?.[dateIndex]).slice(0, 10);
    if (/^\d{6,}$/.test(id) && name && date === today) {
      books.push({ id, name, rowDate: date });
    }
  }
  return books;
}

function uniqueBooks(books) {
  const seen = new Set();
  const result = [];
  for (const book of books || []) {
    if (seen.has(book.id)) continue;
    seen.add(book.id);
    result.push(book);
  }
  return result;
}

function isBookCompletedByOutput(outputIndex, book) {
  const id = String(book?.id || "").trim();
  const name = String(book?.name || "").trim();
  return Boolean((id && outputIndex?.ids?.has(id)) || (name && outputIndex?.names?.has(name)));
}

module.exports = { cellText, excelSerialToChinaDate, findHeaderRow, isBookCompletedByOutput, parseFallbackBooks, uniqueBooks };
