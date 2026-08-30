const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  millisecondsUntilNextChinaMidnight,
  operationalCounts,
  readTodayDetectedBooks,
  readTodayDetectedCount,
  readTodayOutputCount,
  recordTodayDetectedBooks,
  statusPanelText,
  terminalFailureDetails,
} = require("../src/status-utils");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dianzhong-status-"));
const detectedFile = path.join(temp, "detected.jsonl");
const outputFile = path.join(temp, "output.jsonl");
const today = new Date("2026-07-23T01:00:00.000Z");
const tomorrow = new Date("2026-07-24T01:00:00.000Z");

assert.strictEqual(recordTodayDetectedBooks(["100", "101", "100"], today, detectedFile), 2);
assert.strictEqual(recordTodayDetectedBooks(["101", "102"], today, detectedFile), 3);
assert.strictEqual(readTodayDetectedCount(today, detectedFile), 3);
assert.strictEqual(readTodayDetectedCount(tomorrow, detectedFile), 0);
assert.strictEqual(recordTodayDetectedBooks([
  { bookId: "103", source: "fallback", sourceDate: "2026-07-23" },
  { bookId: "104", source: "fallback", sourceDate: "2026-07-22" },
], today, detectedFile), 4);
assert.strictEqual(readTodayDetectedCount(today, detectedFile), 4);
assert.strictEqual(readTodayDetectedBooks(today, detectedFile).length, 4);

fs.writeFileSync(outputFile, [
  JSON.stringify({ date: "2026-07-23", bookId: "100" }),
  JSON.stringify({ date: "2026-07-23", bookId: "101" }),
  JSON.stringify({ date: "2026-07-23", bookId: "113" }),
  JSON.stringify({ date: "2026-07-24", bookId: "102" }),
].join("\n") + "\n", "utf8");
assert.strictEqual(readTodayOutputCount(today, outputFile), 3);
assert.strictEqual(readTodayOutputCount(tomorrow, outputFile), 1);
assert(millisecondsUntilNextChinaMidnight(today) > 0);

const text = statusPanelText({
  scannedBooks: 1000,
  lastScanTodayBooks: 12,
  todayBooks: 35,
  newBooks: 3,
  todayOutputCount: 9,
});
assert(text.includes("\u4eca\u65e5\u53d1\u73b0\u603b\u4e66\u7c4d\uff1a35"));
assert(text.includes("\u4eca\u65e5\u5b9e\u9645\u51fa\u4e66\uff1a9"));

const pendingFile = path.join(temp, "queue.json");
const failedFile = path.join(temp, "failed.json");
const fallbackFile = path.join(temp, "fallback.json");
const pendingFeishuDir = path.join(temp, "pending-feishu");
fs.mkdirSync(pendingFeishuDir);
fs.writeFileSync(path.join(pendingFeishuDir, "105.json"), "{}", "utf8");
fs.writeFileSync(pendingFile, JSON.stringify({ books: [
  { id: "103", name: "未处理", sourceDate: "2026-07-23" },
  { id: "104", name: "重启恢复", sourceDate: "2026-07-23", attemptStartedAt: "2026-07-23T01:00:00.000Z" },
] }), "utf8");
fs.writeFileSync(failedFile, JSON.stringify({
  queue: {
    "106": { bookId: "106", listedAt: "2026-07-23 08:00:00", failCount: 2 },
    "111": { bookId: "111", listedAt: "2026-07-22 23:00:00", reason: "旧活动失败", failCount: 2 },
  },
  terminalFailures: [
    { bookId: "107", bookName: "彻底失败", reason: "失败原因", failCount: 24, discoveredAt: "2026-07-23T01:00:00.000Z", failedAt: "2026-07-24T01:00:00.000Z" },
    { bookId: "110", bookName: "误判失败", reason: "失败书籍已过当天，不再重试：未审核通过", failCount: 1, failedAt: "2026-07-24T01:00:00.000Z" },
    { bookId: "112", bookName: "旧平台失败但今日兜底", reason: "旧失败", failCount: 24, failedAt: "2026-07-22T01:00:00.000Z" },
    { bookId: "113", bookName: "已成功", reason: "旧失败", failCount: 24, failedAt: "2026-07-22T01:00:00.000Z" },
  ],
}), "utf8");
fs.writeFileSync(fallbackFile, JSON.stringify({ books: {
  "108": { bookId: "108", rowDate: "2026-07-23", status: "pending", discoveredAt: "2026-07-23T02:00:00.000Z" },
  "109": { bookId: "109", rowDate: "2026-07-23", failCount: 1, discoveredAt: "2026-07-23T02:00:00.000Z" },
  "112": { bookId: "112", rowDate: "2026-07-23", failCount: 1, discoveredAt: "2026-07-23T02:00:00.000Z" },
}, terminalFailures: [] }), "utf8");
const options = { detectionFile: detectedFile, outputFile, pendingQueueFile: pendingFile, failedQueueFile: failedFile, fallbackStateFile: fallbackFile, pendingFeishuDir };
const counts = operationalCounts(today, options);
assert.strictEqual(counts.todayBooks, 4);
assert.strictEqual(counts.todayOutputCount, 3);
assert.strictEqual(counts.pendingCount, 2);
assert.strictEqual(counts.retryQueueCount, 5);
assert.strictEqual(counts.terminalFailureCount, 3);
const details = terminalFailureDetails(today, options);
assert.deepStrictEqual(new Set(details.map((item) => item.bookId)), new Set(["107", "110", "111"]));
assert(!details.some((item) => item.bookId === "112"));
assert(!details.some((item) => item.bookId === "113"));

fs.rmSync(temp, { recursive: true, force: true });
console.log("status-utils tests passed");
