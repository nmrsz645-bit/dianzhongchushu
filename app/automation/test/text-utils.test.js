const assert = require("assert");
const { buildSafeLabels, cleanNovelText, readForbiddenWordsFromText, safeFileName } = require("../src/text-utils");

function testCleanNovelTextRemovesBlankLinesStandaloneChapterTitlesAndNumberLines() {
  const input = ["第1章", "", "正文第一段", "1", "第一章", "正文第二段", "第十二章 高光时刻", "继续正文"].join("\n");
  assert.strictEqual(cleanNovelText(input), ["正文第一段", "正文第二段", "第十二章 高光时刻", "继续正文"].join("\n"));
}

function testSafeFileNameRemovesWindowsIllegalCharacters() {
  assert.strictEqual(safeFileName("A/B:*?\"<>|  书"), "AB 书");
}

function testReadForbiddenWordsNormalizesHash() {
  assert.deepStrictEqual(readForbiddenWordsFromText("#出轨\n  血腥 \n"), ["出轨", "血腥"]);
}

function testBuildSafeLabelsFiltersForbiddenWordsAndAddsHotTopic() {
  const labels = buildSafeLabels("书名", "孩子 画展 家庭 反击 出轨", ["出轨"]);
  assert(labels.includes("#亲子守护"));
  assert(!labels.some((label) => label.includes("出轨")));
  assert.strictEqual(labels.at(-1), "#热门小说");
}

function testBuildSafeLabelsVariesByBookContent() {
  const schoolLabels = buildSafeLabels("高考志愿被妈妈改掉", "老师 学校 高考 志愿 同学 成绩", []);
  const familyLabels = buildSafeLabels("婚礼当天我离开婆家", "老公 婆婆 婚礼 丈夫 彩礼 家庭", []);
  assert.notDeepStrictEqual(schoolLabels.slice(0, 6), familyLabels.slice(0, 6));
  assert(schoolLabels.includes("#校园成长"));
  assert(familyLabels.includes("#婚恋情感"));
}

testCleanNovelTextRemovesBlankLinesStandaloneChapterTitlesAndNumberLines();
testSafeFileNameRemovesWindowsIllegalCharacters();
testReadForbiddenWordsNormalizesHash();
testBuildSafeLabelsFiltersForbiddenWordsAndAddsHotTopic();
testBuildSafeLabelsVariesByBookContent();
console.log("text-utils tests passed");
