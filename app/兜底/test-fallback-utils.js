const assert = require("assert");
const { excelSerialToChinaDate, isBookCompletedByOutput, parseFallbackBooks, uniqueBooks } = require("./fallback-utils");

assert.strictEqual(excelSerialToChinaDate(46209), "2026-07-06");

const urgentShortRows = [
  ["提示"],
  ["素材网盘链接", "时间", "投放时段", "独家&非独家", "书籍ID", "书籍名称"],
  [null, 46209, "下午14:00", "独家原创", 11010517947, "妈妈把我的志愿换给了妹妹"],
  [null, 46208, "下午14:00", "独家原创", 11010517948, "旧书"],
];
assert.deepStrictEqual(parseFallbackBooks(urgentShortRows, "2026-07-06"), [
  { id: "11010517947", name: "妈妈把我的志愿换给了妹妹", rowDate: "2026-07-06" },
]);

const urgentMediumRows = [
  ["日期", "推荐标签", "独家类型", "ID", "书名"],
  [46209, "爆款迭代", "独家原创", 11010513483, "秋风知雨安"],
];
assert.deepStrictEqual(parseFallbackBooks(urgentMediumRows, "2026-07-06"), [
  { id: "11010513483", name: "秋风知雨安", rowDate: "2026-07-06" },
]);

assert.deepStrictEqual(uniqueBooks([{ id: "1" }, { id: "1" }, { id: "2" }]).map((book) => book.id), ["1", "2"]);

const completed = {
  ids: new Set(["11010500001"]),
  names: new Set(["已经出过的书"]),
};
assert.strictEqual(isBookCompletedByOutput(completed, { id: "11010500002", name: "已经出过的书" }), true);
assert.strictEqual(isBookCompletedByOutput(completed, { id: "11010500001", name: "别的书名" }), true);
assert.strictEqual(isBookCompletedByOutput(completed, { id: "11010500003", name: "新书名" }), false);

console.log("fallback-utils tests passed");
