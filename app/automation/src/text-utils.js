const fs = require("fs");

const HOT_TOPIC = "#热门小说";

const KEYWORD_RULES = [
  { topic: "#校园成长", words: ["高考", "志愿", "学校", "老师", "同学", "成绩", "班主任", "清北", "大学", "落榜"] },
  { topic: "#亲子守护", words: ["孩子", "儿子", "女儿", "妈妈", "爸爸", "父母", "亲妈", "弟弟", "妹妹", "哥哥", "家庭"] },
  { topic: "#婚恋情感", words: ["婚礼", "老公", "丈夫", "妻子", "婆婆", "彩礼", "订婚", "新娘", "男友", "女友", "初恋"] },
  { topic: "#职场故事", words: ["老板", "公司", "职场", "同事", "辞职", "工资", "高管", "查账", "档口"] },
  { topic: "#高能反转", words: ["反手", "揭穿", "真相", "打脸", "后悔", "悔疯", "取消", "曝光", "全网"] },
  { topic: "#女性成长", words: ["女儿", "妻子", "新娘", "妈妈", "女生", "校花", "女配", "女性"] },
  { topic: "#家庭关系", words: ["家", "全家", "亲戚", "大伯", "婆婆", "爸妈", "父母", "弟弟", "妹妹"] },
  { topic: "#现实故事", words: ["拆迁", "贷款", "房", "钱", "转账", "补偿", "食堂", "账本", "电梯"] },
  { topic: "#重生逆袭", words: ["重生", "觉醒", "穿书", "穿进", "攻略", "满级", "逆袭"] },
  { topic: "#情感故事", words: ["爱情", "分手", "离开", "不爱", "等", "月光", "春风", "薄情"] },
  { topic: "#爽文短篇", words: ["反击", "反手", "取消", "撤资", "净身出户", "血本无归"] },
  { topic: "#人生选择", words: ["选择", "不要了", "退出", "离开", "不接了", "不再"] },
];

const SAFE_TOPIC_POOL = [
  "#短篇小说",
  "#情感故事",
  "#现实故事",
  "#家庭关系",
  "#高能反转",
  "#人生选择",
  "#女性成长",
  "#爽文短篇",
  "#校园成长",
  "#婚恋情感",
  "#职场故事",
  "#亲子守护",
];

function safeFileName(name) {
  const cleaned = String(name || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error("书名为空，不能生成文本档");
  return cleaned;
}

function isChapterTitleLine(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  return /^第\s*([0-9０-９一二三四五六七八九十百千万两〇零]+)\s*[章节回卷部]\s*$/.test(text);
}

function isNumberOnlyLine(line) {
  return /^[0-9０-９]+$/.test(String(line || "").trim());
}

function cleanNovelText(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isChapterTitleLine(line) && !isNumberOnlyLine(line))
    .join("\n");
}

function readForbiddenWordsFromText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function readForbiddenWords(file) {
  try {
    return readForbiddenWordsFromText(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function containsForbidden(label, forbiddenWords) {
  const text = String(label || "").replace(/^#+/, "");
  return forbiddenWords.some((word) => word && text.includes(word.replace(/^#+/, "")));
}

function stableHash(text) {
  let hash = 0;
  for (const char of String(text || "")) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return hash;
}

function rotatedPool(bookName) {
  const start = stableHash(bookName) % SAFE_TOPIC_POOL.length;
  return [...SAFE_TOPIC_POOL.slice(start), ...SAFE_TOPIC_POOL.slice(0, start)];
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function buildSafeLabels(bookName, content, forbiddenWords = []) {
  const text = `${bookName}\n${content}`;
  const picked = [];
  const add = (topic) => {
    if (picked.length >= 6) return;
    if (containsForbidden(topic, forbiddenWords)) return;
    if (!picked.includes(topic)) picked.push(topic);
  };

  for (const rule of KEYWORD_RULES) {
    if (hasAny(text, rule.words)) add(rule.topic);
  }
  for (const topic of rotatedPool(bookName)) add(topic);
  return [...picked.slice(0, 6), HOT_TOPIC];
}

module.exports = {
  HOT_TOPIC,
  buildSafeLabels,
  cleanNovelText,
  readForbiddenWords,
  readForbiddenWordsFromText,
  safeFileName,
};
