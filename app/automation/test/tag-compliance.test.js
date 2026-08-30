const assert = require("assert");
const { sanitizeLabels } = require("../src/tag-compliance");

function testRiskyTagsAreRemovedAndNeutralFallbackIsUsed() {
  const labels = sanitizeLabels([
    "#\u519b\u4eba\u7231\u60c5", "#\u8840\u817d\u590d\u4ec7", "#\u6027\u611f\u79d8\u4e66",
    "#\u79e6\u65e2\u660e", "#\u79bb\u5a5a", "#\u8c6a\u95e8", "#\u70ed\u95e8\u5c0f\u8bf4",
  ]);
  assert(labels.includes("#\u79e6\u65e2\u660e"));
  assert(labels.includes("#\u79bb\u5a5a"));
  assert(labels.includes("#\u8c6a\u95e8"));
  assert(!labels.some((tag) => /\u519b\u4eba|\u8840\u817d|\u6027\u611f/.test(tag)));
  assert.strictEqual(labels.at(-1), "#\u70ed\u95e8\u5c0f\u8bf4");
}

function testForbiddenAndCustomTermsAreRemoved() {
  const labels = sanitizeLabels(["#\u8bef\u4f1a", "#\u6f14\u5458\u540d", "#\u70ed\u95e8\u5c0f\u8bf4"], {
    forbiddenWords: ["\u8bef\u4f1a"], customRulesText: "\u6f14\u5458\u540d\n# comment",
  });
  assert(!labels.includes("#\u8bef\u4f1a"));
  assert(!labels.includes("#\u6f14\u5458\u540d"));
  assert(labels.includes("#\u5c0f\u8bf4\u63a8\u8350"));
}

function testRiskyRelationshipTermsAreNeutralized() {
  const labels = sanitizeLabels(["#\u5c0f\u4e09", "#\u51fa\u8f68", "#\u70ed\u95e8\u5c0f\u8bf4"]);
  assert(labels.includes("#\u60c5\u611f\u7ea0\u845b"));
  assert(labels.includes("#\u60c5\u611f\u8bef\u4f1a"));
}

testRiskyTagsAreRemovedAndNeutralFallbackIsUsed();
testForbiddenAndCustomTermsAreRemoved();
testRiskyRelationshipTermsAreNeutralized();
console.log("tag-compliance tests passed");
