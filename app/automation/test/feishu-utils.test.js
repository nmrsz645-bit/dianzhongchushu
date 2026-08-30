const assert = require("assert");
const { buildCompletedBookIndex, buildCompleteFeishuRow, firstEmptyAtoGRow, formatFeishuLabel, hasBookNameInRows, nextManualBookName, parseFeishuConfig } = require("../src/feishu-utils");

function testFirstEmptyAtoGRowSkipsHeaderAndPartialRows() {
  const values = [
    ["date", "book", "start", "param", "label", "F", "G"],
    ["2026-07-05", "old book", "", "", "label", "", ""],
    ["", "", "", "", "", "", "has g"],
    ["", "", "", "", "", "", ""],
  ];
  assert.strictEqual(firstEmptyAtoGRow(values), 4);
}

function testFirstEmptyAtoGRowAppendsWhenNoEmptyRows() {
  assert.strictEqual(firstEmptyAtoGRow([["date"], ["x"]]), 3);
}

function testHasBookNameInRowsMatchesColumnBExactly() {
  const values = [
    ["date", "book"],
    ["2026-07-07", "重复书名"],
    ["2026-07-07", "重复书名2"],
  ];
  assert.strictEqual(hasBookNameInRows(values, "重复书名"), true);
  assert.strictEqual(hasBookNameInRows(values, "重复书"), false);
}

function testNextManualBookNameAddsDashesForRepeatedManualWrites() {
  const values = [
    ["date", "book"],
    ["2026-07-07", "测试书"],
    ["2026-07-07", "《测试书》"],
    ["2026-07-07", "《测试书》-"],
  ];
  assert.strictEqual(nextManualBookName(values, "测试书"), "《测试书》--");
  assert.strictEqual(nextManualBookName([["date", "book"]], "新书"), "新书");
}

function testBuildCompletedBookIndexReadsBookNamesAndBookIds() {
  const index = buildCompletedBookIndex([
    ["date", "book", "", "", "", "start", "param"],
    ["2026-07-09", "已出书名", "", "", "", "pages/index", "bookId=11010500001&x=1"],
    ["2026-07-09", "  另一本  ", "", "", "", "pages/index", "no-id"],
  ]);
  assert(index.names.has("已出书名"));
  assert(index.names.has("另一本"));
  assert(index.ids.has("11010500001"));
  assert(!index.ids.has("11010500002"));
}

function testFormatFeishuLabelWrapsBookName() {
  assert.strictEqual(formatFeishuLabel("Test Book", ["#topic", "#hot"]), "《Test Book》 #topic #hot");
}

function testFormatFeishuLabelLimitsTotalLength() {
  const labels = [
    "#女性成长",
    "#现实故事",
    "#高能反转",
    "#人生选择",
    "#家庭关系",
    "#热门小说",
  ];
  const label = formatFeishuLabel("这是一本书名稍微长一点", labels);
  assert(label.length <= 55);
  assert(label.startsWith("《这是一本书名稍微长一点》"));
  for (const token of label.split(/\s+/).slice(1)) {
    assert(labels.includes(token));
  }
}

function testFormatFeishuLabelAlwaysKeepsHotTopic() {
  const label = formatFeishuLabel("二十三字书名二十三字书名二十三字书名二", [
    "#女性成长",
    "#现实故事",
    "#高能反转",
    "#人生选择",
    "#家庭关系",
    "#热门小说",
  ]);
  assert(label.length <= 55);
  assert(label.includes("#热门小说"));
  assert(label.startsWith("《二十三字书名二十三字书名二十三字书名二》"));
}

function testFormatFeishuLabelKeepsVeryLongBookNameUnchanged() {
  const bookName = "长".repeat(80);
  const label = formatFeishuLabel(bookName, ["#热门小说"]);
  assert.strictEqual(label, `《${bookName}》 #热门小说`);
}

function testParseFeishuConfigReadsAppAndLink() {
  const parsed = parseFeishuConfig("App ID: cli_x\nApp Secret: sec_y\nhttps://abc.feishu.cn/wiki/xxx");
  assert.deepStrictEqual(parsed, { appId: "cli_x", appSecret: "sec_y", link: "https://abc.feishu.cn/wiki/xxx" });
}

function testBuildCompleteFeishuRowRequiresReferralFields() {
  assert.deepStrictEqual(
    buildCompleteFeishuRow({
      date: "2026-07-06",
      bookName: "Book",
      labelText: "#label",
      startPage: "pages/novel_plugin/index",
      startParam: "bookId=1",
    }),
    ["2026-07-06", "Book", "", "", "#label", "pages/novel_plugin/index", "bookId=1"]
  );
  assert.throws(
    () => buildCompleteFeishuRow({ date: "2026-07-06", bookName: "Book", labelText: "#label", startPage: "", startParam: "bookId=1" }),
    /启动页/
  );
}

testFirstEmptyAtoGRowSkipsHeaderAndPartialRows();
testFirstEmptyAtoGRowAppendsWhenNoEmptyRows();
testHasBookNameInRowsMatchesColumnBExactly();
testNextManualBookNameAddsDashesForRepeatedManualWrites();
testBuildCompletedBookIndexReadsBookNamesAndBookIds();
testFormatFeishuLabelWrapsBookName();
testFormatFeishuLabelLimitsTotalLength();
testFormatFeishuLabelAlwaysKeepsHotTopic();
testFormatFeishuLabelKeepsVeryLongBookNameUnchanged();
testParseFeishuConfigReadsAppAndLink();
testBuildCompleteFeishuRowRequiresReferralFields();
console.log("feishu-utils tests passed");
