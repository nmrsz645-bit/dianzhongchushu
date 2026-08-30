const assert = require("assert");
const {
  extractFirstDateTime,
  isTodayChina,
  parseBookRowsFromCellRows,
  parseBookRowsFromTableText,
  pickReferralFromRows,
  pickDownloadableChapters,
} = require("../src/platform-utils");

function testParseBookRowsFromCellRowsWithCheckboxAndCoverColumns() {
  const rows = parseBookRowsFromCellRows([
    ["", "11010517974", "", "Demo Book", "Short", "Female", "", "Novel", "No", "-", "Done", "9243", "11", "2026-07-05 01:02:03", "Link"],
  ]);
  assert.deepStrictEqual(rows[0], {
    id: "11010517974",
    name: "Demo Book",
    listedAt: "2026-07-05 01:02:03",
  });
}

function testParseBookRowsFromTableTextKeepsFallbackWorking() {
  const text = [
    "book id\tcover\tname\tcategory\tlisted at",
    "11010517974\t\tDemo Book\tShort\t2026-07-05 01:02:03",
  ].join("\n");
  assert.deepStrictEqual(parseBookRowsFromTableText(text)[0], {
    id: "11010517974",
    name: "Demo Book",
    listedAt: "2026-07-05 01:02:03",
  });
}

function testPickDownloadableChaptersOnlyRowsWithDownload() {
  const chapters = [
    { chapterNo: "1", title: "Chapter 1", href: "/c1", downloadText: "\u4e0b\u8f7d" },
    { chapterNo: "2", title: "Chapter 2", href: "/c2", downloadText: "-" },
  ];
  assert.deepStrictEqual(pickDownloadableChapters(chapters), [chapters[0]]);
}

function testIsTodayChina() {
  assert.strictEqual(isTodayChina("2026-07-05 01:02:03", "2026-07-05"), true);
  assert.strictEqual(isTodayChina("2026-07-04 23:59:59", "2026-07-05"), false);
}

function testExtractFirstDateTime() {
  assert.strictEqual(extractFirstDateTime("book 2026-07-07 05:00:01 done"), "2026-07-07 05:00:01");
  assert.strictEqual(extractFirstDateTime("no date"), "");
}

function testPickReferralFromRowsMatchesBookNameAndLinks() {
  const rows = [
    { text: "其他书", links: ["pages/novel_plugin/index", "bookId=wrong"] },
    { text: "目标书名", links: ["复制", "pages/novel_plugin/index", "bookId=11010518251&chapterId=1"] },
  ];
  assert.deepStrictEqual(pickReferralFromRows(rows, "目标书名"), {
    startPage: "pages/novel_plugin/index",
    startParam: "bookId=11010518251&chapterId=1",
    rowText: "目标书名",
  });
}

function testPickReferralFromRowsReadsWrappedTableText() {
  const rows = [
    {
      text: [
        "420645107",
        "pages/novel_plugin/index?bookId=11010518431&sid=1&channelId=97328&referral_id=420645107&book_id=776593582753806441028&micro_pannel_id=DZ97328XS420645107&from=dy",
        "pages/novel_plugin/index",
        "bookId=11010518431&sid=1&channelId=97328&referral_id=420645107&book_id=776593582753806441028&micro_pannel_id=DZ97328XS420645107&from=dy",
        "十万尾款，换我一身清白",
        "章节名称：第1章",
      ].join("\n"),
      links: [],
    },
  ];
  assert.deepStrictEqual(pickReferralFromRows(rows, "十万尾款，换我一身清白"), {
    startPage: "pages/novel_plugin/index",
    startParam: "bookId=11010518431&sid=1&channelId=97328&referral_id=420645107&book_id=776593582753806441028&micro_pannel_id=DZ97328XS420645107&from=dy",
    rowText: rows[0].text,
  });
}

function testPickReferralFromRowsPrefersBookIdWhenNameMissing() {
  const rows = [
    {
      text: "其他书\npages/novel_plugin/index\nbookId=11010500000&chapterId=1",
      links: [],
    },
    {
      text: "页面未完整显示书名\npages/novel_plugin/index\nbookId=11010518600&chapterId=1&from=dy",
      links: [],
    },
  ];
  assert.deepStrictEqual(pickReferralFromRows(rows, "完整书名不在页面里", "11010518600"), {
    startPage: "pages/novel_plugin/index",
    startParam: "bookId=11010518600&chapterId=1&from=dy",
    rowText: rows[1].text,
  });
}

function testPickReferralFromRowsDoesNotFallbackToWrongBookWhenBookIdExpected() {
  const rows = [
    {
      text: "其他书\npages/novel_plugin/index\nbookId=11010500000&chapterId=1",
      links: [],
    },
  ];
  assert.strictEqual(pickReferralFromRows(rows, "目标书", "11010518600"), null);
}

testParseBookRowsFromCellRowsWithCheckboxAndCoverColumns();
testParseBookRowsFromTableTextKeepsFallbackWorking();
testPickDownloadableChaptersOnlyRowsWithDownload();
testIsTodayChina();
testExtractFirstDateTime();
testPickReferralFromRowsMatchesBookNameAndLinks();
testPickReferralFromRowsReadsWrappedTableText();
testPickReferralFromRowsPrefersBookIdWhenNameMissing();
testPickReferralFromRowsDoesNotFallbackToWrongBookWhenBookIdExpected();
console.log("platform-utils tests passed");
