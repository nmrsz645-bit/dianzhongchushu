const assert = require("assert");
const {
  buildAiTagPrompt,
  buildOpenAIChatBody,
  getOpenAIChatCompletionsUrl,
  cleanAiLabels,
  isDashScopeEndpoint,
  isDashScopeOpenAICompatibleEndpoint,
  parseDeepSeekConfig,
  selectLabelsWithFallback,
} = require("../src/ai-tags");

function testParseDeepSeekConfig() {
  const config = parseDeepSeekConfig([
    "\u542f\u7528\uff1a\u662f",
    "API Key\uff1ask_test",
    "\u6a21\u578b\uff1adeepseek-chat",
    "\u63a5\u53e3\uff1ahttps://api.deepseek.com/chat/completions",
    "\u8d85\u65f6\u79d2\u6570\uff1a15",
  ].join("\n"));

  assert.deepStrictEqual(config, {
    enabled: true,
    apiKey: "sk_test",
    model: "deepseek-chat",
    endpoint: "https://api.deepseek.com/chat/completions",
    timeoutMs: 15000,
  });
}

function testParseDeepSeekConfigSupportsEnglishTemplate() {
  const config = parseDeepSeekConfig("Enable: yes\nAPI Key: sk_test\nModel: deepseek-chat");
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.apiKey, "sk_test");
  assert.strictEqual(config.model, "deepseek-chat");
}

function testParseDeepSeekConfigRecognizesAliyunDashScope() {
  const config = parseDeepSeekConfig("Enable: yes\nAPI Key: sk_test\nEndpoint: https://workspace.cn-beijing.maas.aliyuncs.com/api/v1");
  assert.strictEqual(config.model, "deepseek-v3");
  assert.strictEqual(isDashScopeEndpoint(config.endpoint), true);
}

function testAliyunOpenAICompatibleRequestDisablesThinking() {
  const endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  assert.strictEqual(isDashScopeOpenAICompatibleEndpoint(endpoint), true);
  assert.strictEqual(isDashScopeEndpoint(endpoint), false);
  assert.strictEqual(getOpenAIChatCompletionsUrl(endpoint).toString(), endpoint + "/chat/completions");

  for (const model of ["deepseek-v4-flash-0731", "qwen3.8-flash"]) {
    const body = buildOpenAIChatBody({ model, endpoint }, "generate labels");
    assert.strictEqual(body.model, model);
    assert.strictEqual(body.enable_thinking, false);
  }
}

function testCleanAiLabelsFiltersForbiddenAndNormalizesHash() {
  const labels = cleanAiLabels(
    "\u6821\u56ed\u6210\u957f, #\u5bb6\u5ead\u5173\u7cfb #\u51fa\u8f68 #\u5973\u6027\u6210\u957f\n#\u6821\u56ed\u6210\u957f #\u9ad8\u80fd\u53cd\u8f6c #\u4eba\u751f\u9009\u62e9 #\u73b0\u5b9e\u6545\u4e8b",
    ["\u51fa\u8f68"]
  );
  assert.deepStrictEqual(labels, [
    "#\u6821\u56ed\u6210\u957f",
    "#\u5bb6\u5ead\u5173\u7cfb",
    "#\u5973\u6027\u6210\u957f",
    "#\u9ad8\u80fd\u53cd\u8f6c",
    "#\u4eba\u751f\u9009\u62e9",
    "#\u73b0\u5b9e\u6545\u4e8b",
    "#\u70ed\u95e8\u5c0f\u8bf4",
  ]);
}

function testCleanAiLabelsKeepsShortStoryTagsAndHotTopic() {
  const labels = cleanAiLabels("#\u6797\u6f88 #\u4e54\u6d45\u6708 #\u5b8b\u9038\u6668 #\u9752\u6885\u7af9\u9a6c #\u9ad8\u8003\u9a97\u5c40 #\u7231\u60c5\u80cc\u53db #\u590d\u4ec7\u53cd\u51fb #\u70ed\u95e8\u5c0f\u8bf4", []);
  assert.deepStrictEqual(labels, [
    "#\u6797\u6f88",
    "#\u4e54\u6d45\u6708",
    "#\u5b8b\u9038\u6668",
    "#\u9752\u6885\u7af9\u9a6c",
    "#\u7231\u60c5\u80cc\u53db",
    "#\u590d\u4ec7\u53cd\u51fb",
    "#\u70ed\u95e8\u5c0f\u8bf4",
  ]);
}

function testBuildAiTagPromptIncludesRules() {
  const prompt = buildAiTagPrompt("\u4e66\u540d", "\u7b80\u4ecb", "\u6b63\u6587", ["\u51fa\u8f68"]);
  assert(prompt.includes("\u6807\u7b7e\u6700\u591a12\u4e2a"));
  assert(prompt.includes("#\u70ed\u95e8\u5c0f\u8bf4"));
  assert(prompt.includes("\u4e0d\u8981\u8f93\u51fa\u6cdb\u6807\u7b7e"));
  assert(prompt.includes("\u4e66\u540d"));
  assert(prompt.includes("\u51fa\u8f68"));
}

function testBuildAiTagPromptPrefersCharacterNamesWithoutInventing() {
  const prompt = buildAiTagPrompt("\u4e66\u540d", "\u7b80\u4ecb", "\u6797\u665a\u548c\u6c88\u781a\u5bf9\u8d28", []);
  assert(prompt.includes("\u4eba\u7269\u540d"));
  assert(prompt.includes("\u4f18\u5148"));
  assert(prompt.includes("\u7981\u6b62\u7f16\u9020"));
  assert(prompt.includes("\u4e0d\u8981\u590d\u5236\u793a\u4f8b\u4eba\u7269\u540d"));
}

function testCleanAiLabelsFiltersAdvertisingRisk() {
  const labels = cleanAiLabels("#\u519b\u4eba\u7231\u60c5 #\u8840\u817d\u590d\u4ec7 #\u68fa\u6750\u5077\u60c5 #\u79bb\u5a5a #\u8c6a\u95e8 #\u70ed\u95e8\u5c0f\u8bf4", []);
  assert(!labels.some((label) => /\u519b\u4eba|\u8840\u817d|\u68fa\u6750|\u5077\u60c5/.test(label)));
  assert(labels.includes("#\u79bb\u5a5a"));
  assert(labels.includes("#\u8c6a\u95e8"));
  assert.strictEqual(labels.at(-1), "#\u70ed\u95e8\u5c0f\u8bf4");
}

async function testSelectLabelsWithFallbackUsesAiWhenValid() {
  const labels = await selectLabelsWithFallback({
    bookName: "\u9ad8\u8003\u5fd7\u613f\u88ab\u5988\u5988\u6539\u6389",
    description: "\u5b66\u6821 \u9ad8\u8003",
    novelText: "\u8001\u5e08 \u540c\u5b66 \u6210\u7ee9",
    forbiddenWords: [],
    configText: "\u542f\u7528\uff1a\u662f\nAPI Key\uff1ask_test",
    requestLabels: async () =>
      "#\u6797\u6f88 #\u4e54\u6d45\u6708 #\u5b8b\u9038\u6668 #\u9752\u6885\u7af9\u9a6c #\u9ad8\u8003\u9a97\u5c40 #\u7231\u60c5\u80cc\u53db #\u590d\u4ec7\u53cd\u51fb #\u70ed\u95e8\u5c0f\u8bf4",
  });
  assert.deepStrictEqual(labels, [
    "#\u6797\u6f88",
    "#\u4e54\u6d45\u6708",
    "#\u5b8b\u9038\u6668",
    "#\u9752\u6885\u7af9\u9a6c",
    "#\u7231\u60c5\u80cc\u53db",
    "#\u590d\u4ec7\u53cd\u51fb",
    "#\u70ed\u95e8\u5c0f\u8bf4",
  ]);
}

async function testSelectLabelsWithFallbackUsesLocalWhenAiFails() {
  const labels = await selectLabelsWithFallback({
    bookName: "\u5a5a\u793c\u5f53\u5929\u6211\u79bb\u5f00\u5a46\u5bb6",
    description: "\u8001\u516c \u5a46\u5a46 \u5a5a\u793c",
    novelText: "\u4e08\u592b \u5f69\u793c \u5bb6\u5ead",
    forbiddenWords: [],
    configText: "\u542f\u7528\uff1a\u662f\nAPI Key\uff1ask_test",
    requestLabels: async () => {
      throw new Error("network");
    },
  });
  assert(labels.includes("#\u5a5a\u604b\u60c5\u611f"));
  assert.strictEqual(labels.at(-1), "#\u70ed\u95e8\u5c0f\u8bf4");
}

(async () => {
  testParseDeepSeekConfig();
  testParseDeepSeekConfigSupportsEnglishTemplate();
  testParseDeepSeekConfigRecognizesAliyunDashScope();
  testAliyunOpenAICompatibleRequestDisablesThinking();
  testCleanAiLabelsFiltersForbiddenAndNormalizesHash();
  testCleanAiLabelsKeepsShortStoryTagsAndHotTopic();
  testBuildAiTagPromptIncludesRules();
  testBuildAiTagPromptPrefersCharacterNamesWithoutInventing();
  testCleanAiLabelsFiltersAdvertisingRisk();
  await testSelectLabelsWithFallbackUsesAiWhenValid();
  await testSelectLabelsWithFallbackUsesLocalWhenAiFails();
  console.log("ai-tags tests passed");
})();
