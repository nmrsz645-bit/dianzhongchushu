const assert = require("assert");
const { buildFailureQueueItem } = require("../src/fallback-failure-utils");

const now = new Date("2026-07-07T00:00:00.000Z");
const book = {
  id: "11010518687",
  name: "测试书",
  source: "兜底表",
  rowDate: "2026-07-07",
};

const firstFailure = buildFailureQueueItem(book, {}, "平台搜不到书籍ID", now);
assert.strictEqual(firstFailure.bookId, "11010518687");
assert.strictEqual(firstFailure.bookName, "测试书");
assert.strictEqual(firstFailure.source, "兜底表");
assert.strictEqual(firstFailure.rowDate, "2026-07-07");
assert.strictEqual(firstFailure.failCount, 1);
assert.strictEqual(firstFailure.reason, "平台搜不到书籍ID");
assert.strictEqual(firstFailure.lastFailedAt, "2026-07-07T00:00:00.000Z");
assert.strictEqual(firstFailure.nextRetryAt, "2026-07-07T01:00:00.000Z");

const secondFailure = buildFailureQueueItem(book, { failCount: 3 }, "平台搜不到书籍ID", now);
assert.strictEqual(secondFailure.failCount, 4);

console.log("fallback-failure tests passed");
