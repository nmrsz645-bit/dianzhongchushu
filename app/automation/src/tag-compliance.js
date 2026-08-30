const { HOT_TOPIC } = require("./text-utils");

const COMPLIANCE_VERSION = 1;

// These are tag-level checks. They deliberately do not block ordinary plot themes
// such as divorce, misunderstanding, family conflict, or personal growth.
const RISK_PATTERNS = [
  /(?:\u653f\u6cbb|\u515a\u59d4|\u653f\u5e9c|\u56fd\u52a1\u9662|\u9886\u5bfc\u4eba|\u4e24\u4f1a|\u56fd\u5e86|\u4e00\u5e26\u4e00\u8def|\u8d38\u6613\u6218|\u56fd\u65d7|\u56fd\u5fbd|\u4eba\u6c11\u5e01|\u56fd\u5bb6\u8ba4\u8bc1|\u56fd\u5bb6\u8bb8\u53ef|\u7ea2\u5934\u6587\u4ef6|\u56fd\u5bbe|\u56fd\u5bb4)/,
  /(?:\u519b\u961f|\u519b\u4eba|\u7279\u79cd\u5175|\u5165\u4f0d|\u73b0\u5f79|\u67aa\u652f|\u5b50\u5f39|\u7ba1\u5236\u5200\u5177)/,
  /(?:\u660e\u661f|\u540d\u4eba|\u5927\u5e08|\u9876\u6d41|\u7231\u8c46|\u5f71\u5e1d|\u5f71\u540e)/,
  /(?:\u6027\u611f|\u4e24\u6027|\u6027\u6697\u793a|\u64e6\u8fb9|\u80f8\u90e8|\u81c0\u90e8|\u5185\u88e4|\u60c5\u5987|\u8272\u60c5|\u9732\u9aa8)/,
  /(?:\u8840\u817d|\u5c38\u4f53|\u6740\u4eba|\u81f4\u6b7b|\u5206\u5c38|\u6076\u9b3c|\u9b3c\u602a|\u7075\u5f02|\u4e27\u846c|\u68fa\u6750|\u6050\u6016)/,
  /(?:\u5077\u60c5)/,
  /(?:\u7ed1\u67b6|\u62d0\u5356|\u8bc8\u9a97|\u9a97\u5c40|\u4f5c\u5f0a|\u8d2a\u6c61|\u884c\u8d3f|\u975e\u6cd5|\u76d1\u7981|\u66ff\u7f6a|\u9876\u7f6a|\u5077\u7a83)/,
  /(?:\u708a\u5bcc|\u62dc\u91d1|\u5acc\u8d2b\u7231\u5bcc|\u5543\u8001|\u4e0d\u5b5d|\u91cd\u7537\u8f7b\u5973|\u6027\u522b\u6b67\u89c6|\u7269\u5316\u5973\u6027|\u5b97\u6559\u6b67\u89c6)/,
  /(?:\u9886\u7ea2\u5305|\u4e2d\u5956|\u7acb\u5373\u6e05\u7406|\u624b\u673a\u4e2d\u6bd2|\u5fae\u4fe1\u5230\u8d26|\u7248\u672c\u66f4\u65b0|\u4e0a\u6ed1|\u89e3\u9501|\u6c38\u4e45\u514d\u8d39|100%\u6709\u6548|\u56fd\u5bb6\u80cc\u4e66)/,
];

const REPLACEMENTS = [
  [/\u5c0f\u4e09/g, "\u60c5\u611f\u7ea0\u845b"],
  [/\u51fa\u8f68/g, "\u60c5\u611f\u8bef\u4f1a"],
];

const SAFE_FALLBACK = ["#\u5c0f\u8bf4\u63a8\u8350", "#\u6545\u4e8b\u5206\u4eab", "#\u4eba\u7269\u6545\u4e8b", "#\u5267\u60c5\u53d1\u5c55", "#\u9605\u8bfb\u63a8\u8350"];

function normalizeTag(value) {
  const text = String(value || "").trim().replace(/^#+/, "").replace(/\s+/g, "");
  return text ? `#${text}` : "";
}

function parseCustomBlockedTerms(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^#+/, "").trim())
    .filter(Boolean);
}

function complianceReason(tag, forbiddenWords = [], customBlockedTerms = []) {
  const text = String(tag || "").replace(/^#+/, "");
  if (!text || text === HOT_TOPIC.replace(/^#+/, "")) return "";
  if (text.length > 12) return "\u6807\u7b7e\u8fc7\u957f";
  if ([...forbiddenWords, ...customBlockedTerms].some((word) => word && text.includes(String(word).replace(/^#+/, "")))) return "\u547d\u4e2d\u8fdd\u7981\u8bcd";
  if (RISK_PATTERNS.some((pattern) => pattern.test(text))) return "\u547d\u4e2d\u5e7f\u544a\u5408\u89c4\u98ce\u9669";
  return "";
}

function replaceRiskyText(tag) {
  let text = String(tag || "");
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  return normalizeTag(text);
}

function sanitizeLabels(labels, { forbiddenWords = [], customRulesText = "" } = {}) {
  const customBlockedTerms = parseCustomBlockedTerms(customRulesText);
  const picked = [];
  const add = (candidate) => {
    const normalized = replaceRiskyText(candidate);
    if (!normalized || normalized === HOT_TOPIC || picked.length >= 11) return;
    if (complianceReason(normalized, forbiddenWords, customBlockedTerms)) return;
    if (!picked.includes(normalized)) picked.push(normalized);
  };

  for (const label of labels || []) add(label);
  if (!picked.length) {
    for (const fallback of SAFE_FALLBACK) add(fallback);
  }
  picked.push(HOT_TOPIC);
  return picked;
}

module.exports = {
  COMPLIANCE_VERSION,
  SAFE_FALLBACK,
  complianceReason,
  parseCustomBlockedTerms,
  sanitizeLabels,
};
