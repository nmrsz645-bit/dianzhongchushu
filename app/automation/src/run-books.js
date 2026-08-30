const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { processBook } = require("./run-book");

function parseBookIds(text) {
  const seen = new Set();
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter((id) => /^\d+$/.test(id) && !seen.has(id) && seen.add(id));
}

async function runBooks(bookIds) {
  for (const bookId of bookIds) {
    try {
      log(`批量处理开始：${bookId}`);
      await processBook(bookId, null, { force: true });
      log(`批量处理完成：${bookId}`);
    } catch (error) {
      log(`批量处理失败：${bookId}，${error.stack || error.message}`);
    }
  }
}

if (require.main === module) {
  const inputFile = process.argv[2];
  if (!inputFile || !fs.existsSync(inputFile)) {
    console.error("用法：node src\\run-books.js <每行一个书籍ID的文本文件>");
    process.exit(1);
  }
  const bookIds = parseBookIds(fs.readFileSync(path.resolve(inputFile), "utf8"));
  if (!bookIds.length) {
    console.error("没有读取到有效书籍ID。");
    process.exit(1);
  }
  runBooks(bookIds).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseBookIds, runBooks };
