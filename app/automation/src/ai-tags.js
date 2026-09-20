const https = require("https");
const { buildSafeLabels, HOT_TOPIC } = require("./text-utils");
const { sanitizeLabels } = require("./tag-compliance");

const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CONTEXT_CHARS = 6000;
const MAX_AI_LABELS = 12;

const TEXT = {
  enabled: "\u542f\u7528",
  yes: "\u662f",
  model: "\u6a21\u578b",
  endpoint: "\u63a5\u53e3",
  timeoutSeconds: "\u8d85\u65f6\u79d2\u6570",
  title: "\u4e66\u540d",
  description: "\u7b80\u4ecb",
  content: "\u6b63\u6587\u7247\u6bb5",
  forbidden: "\u8fdd\u7981\u8bcd",
  none: "\u65e0",
};

function splitConfigLine(line) {
  const match = String(line || "").match(/^([^:\uff1a]+)\s*[:\uff1a]\s*(.*)$/);
  if (!match) return ["", ""];
  return [match[1].trim().toLowerCase(), match[2].trim()];
}

function parseEnabled(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === TEXT.yes || /^(true|yes|1|on)$/i.test(text);
}

function parseDeepSeekConfig(text) {
  const config = {
    enabled: false,
    apiKey: "",
    model: DEFAULT_MODEL,
    endpoint: DEFAULT_ENDPOINT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  let hasExplicitModel = false;

  for (const line of String(text || "").split(/\r?\n/)) {
    const [key, value] = splitConfigLine(line);
    if (!key) continue;
    if (key === TEXT.enabled || key === "enable" || key === "enabled") config.enabled = parseEnabled(value);
    if (key === "api key" || key === "apikey") config.apiKey = value;
    if (key === TEXT.model || key === "model") {
      config.model = value || DEFAULT_MODEL;
      hasExplicitModel = Boolean(value);
    }
    if (key === TEXT.endpoint || key === "endpoint") config.endpoint = value || DEFAULT_ENDPOINT;
    if (key === TEXT.timeoutSeconds || key === "timeout" || key === "timeout seconds") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) config.timeoutMs = seconds * 1000;
    }
  }

  if (isDashScopeEndpoint(config.endpoint) && !hasExplicitModel) config.model = "deepseek-v3";
  return config;
}

function isDashScopeEndpoint(endpoint) {
  try {
    const target = new URL(endpoint || DEFAULT_ENDPOINT);
    return /(?:maas|dashscope)\.aliyuncs\.com$/i.test(target.hostname) && /\/api\/v1\/?$/.test(target.pathname);
  } catch {
    return false;
  }
}

function isDashScopeOpenAICompatibleEndpoint(endpoint) {
  try {
    const target = new URL(endpoint || DEFAULT_ENDPOINT);
    return /(?:maas|dashscope)\.aliyuncs\.com$/i.test(target.hostname) && /\/compatible-mode\/v1(?:\/chat\/completions)?\/?$/.test(target.pathname);
  } catch {
    return false;
  }
}

function getOpenAIChatCompletionsUrl(endpoint) {
  const target = new URL(endpoint || DEFAULT_ENDPOINT);
  target.pathname = target.pathname.replace(/\/+$/, "");
  if (/\/compatible-mode\/v1$/i.test(target.pathname)) target.pathname += "/chat/completions";
  return target;
}

function buildOpenAIChatBody(config, prompt) {
  const body = {
    model: config.model || DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: "\u4f60\u53ea\u8f93\u51fa\u8bdd\u9898\uff0c\u4e0d\u8f93\u51fa\u89e3\u91ca\u3002",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 120,
  };
  // Aliyun Model Studio's OpenAI-compatible API expects this extension at the request-body top level.
  if (isDashScopeOpenAICompatibleEndpoint(config.endpoint)) body.enable_thinking = false;
  return body;
}

function normalizeTopic(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^[\d.\-\u3001\uff0c,\s]+/, "")
    .replace(/[\uff1b;,.，。]+$/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
}

function containsForbidden(label, forbiddenWords) {
  const text = String(label || "").replace(/^#+/, "");
  return forbiddenWords.some((word) => word && text.includes(String(word).replace(/^#+/, "")));
}

function cleanAiLabels(rawText, forbiddenWords = [], customRulesText = "") {
  const tokens = String(rawText || "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .split(/[\s,\uff0c\u3001\uff1b;\n\r]+/)
    .map(normalizeTopic)
    .filter(Boolean);

  const picked = [];
  for (const token of tokens) {
    if (picked.length >= MAX_AI_LABELS - 1) break;
    if (token === HOT_TOPIC) continue;
    if (token.length > 16) continue;
    if (containsForbidden(token, forbiddenWords)) continue;
    if (!picked.includes(token)) picked.push(token);
  }
  picked.push(HOT_TOPIC);
  return sanitizeLabels(picked, { forbiddenWords, customRulesText });
}

function buildAiTagPrompt(bookName, description, novelText, forbiddenWords = []) {
  const context = String(novelText || "").slice(0, MAX_CONTEXT_CHARS);
  const forbidden = forbiddenWords.length ? forbiddenWords.join("\u3001") : TEXT.none;
  return [
    "\u8bf7\u6839\u636e\u5c0f\u8bf4\u6b63\u6587\u63d0\u53d6\u77ed\u6807\u7b7e\uff0c\u91cd\u70b9\u63d0\u53d6\uff1a",
    "1. \u6b63\u6587\u91cc\u771f\u5b9e\u51fa\u73b0\u7684\u4eba\u7269\u540d\u3002",
    "2. \u4eba\u7269\u4e4b\u95f4\u7684\u5173\u7cfb\uff0c\u4f8b\u5982\u9752\u6885\u7af9\u9a6c\u3001\u60c5\u654c\u3001\u767d\u6708\u5149\u3001\u95fa\u871c\u3001\u524d\u4efb\u3002",
    "3. \u5267\u60c5\u91cc\u7684\u60c5\u611f\u53d8\u5316\u3001\u8bef\u4f1a\u3001\u9009\u62e9\u3001\u6210\u957f\u3001\u53cd\u8f6c\u3002",
    "4. \u5173\u952e\u4e8b\u4ef6\uff0c\u4f8b\u5982\u9ad8\u8003\u3001\u5a5a\u5bb4\u3001\u51fa\u56fd\u3001\u65ad\u8054\u3001\u9000\u5a5a\u3002",
    "5. \u5267\u60c5\u8d70\u5411\uff0c\u4f8b\u5982\u53cd\u8f6c\u3001\u771f\u76f8\u3001\u89c9\u9192\u3001\u6210\u957f\u3001\u91cd\u65b0\u9009\u62e9\u3002",
    "",
    "\u8f93\u51fa\u8981\u6c42\uff1a",
    "- \u53ea\u8f93\u51fa\u4e00\u884c\u6807\u7b7e\u3002",
    "- \u6bcf\u4e2a\u6807\u7b7e\u4ee5 # \u5f00\u5934\u3002",
    "- \u6807\u7b7e\u6700\u591a12\u4e2a\u3002",
    "- \u6700\u540e\u5fc5\u987b\u4fdd\u7559 #\u70ed\u95e8\u5c0f\u8bf4\u3002",
    "- \u4eba\u7269\u540d\u5fc5\u987b\u6765\u81ea\u6b63\u6587\uff0c\u7981\u6b62\u7f16\u9020\u3002",
    "- \u4e0d\u8981\u590d\u5236\u793a\u4f8b\u4eba\u7269\u540d\u3002",
    "- \u6807\u7b7e\u8981\u77ed\uff0c2\u52306\u4e2a\u5b57\u4f18\u5148\u3002",
    "- \u5e7f\u544a\u5408\u89c4\u8981\u6c42\uff1a\u4e0d\u8981\u8f93\u51fa\u660e\u661f\u3001\u540d\u4eba\u3001\u653f\u6cbb\u3001\u519b\u4e8b\u3001\u56fd\u5bb6\u673a\u5173\u3001\u6b66\u5668\u3001\u8840\u817d\u3001\u6050\u6016\u3001\u8fdd\u6cd5\u72af\u7f6a\u3001\u4f4e\u4fd7\u4e24\u6027\u3001\u70ab\u5bcc\u62dc\u91d1\u3001\u865a\u5047\u8bf1\u5bfc\u6216\u5b97\u6559\u6b67\u89c6\u6807\u7b7e\u3002",
    "- \u4e0d\u8981\u8f93\u51fa\u6cdb\u6807\u7b7e\uff1a#\u73b0\u5b9e\u6545\u4e8b #\u60c5\u611f\u6545\u4e8b #\u5973\u6027\u6210\u957f #\u5bb6\u5ead\u5173\u7cfb #\u5a5a\u604b\u60c5\u611f\u3002",
    "- \u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u603b\u7ed3\uff0c\u4e0d\u8981\u7f16\u53f7\u3002",
    "",
    "\u4f18\u5148\u8f93\u51fa\u683c\u5f0f\uff1a",
    "#\u4eba\u7269\u540d #\u4eba\u7269\u540d #\u4eba\u7269\u540d #\u4eba\u7269\u5173\u7cfb #\u60c5\u611f\u8bef\u4f1a #\u4eba\u751f\u9009\u62e9 #\u5267\u60c5\u53cd\u8f6c #\u70ed\u95e8\u5c0f\u8bf4",
    "",
    "\u53c2\u8003\u98ce\u683c\uff1a",
    "#\u6797\u6f88 #\u4e54\u6d45\u6708 #\u5b8b\u9038\u6668 #\u9752\u6885\u7af9\u9a6c #\u60c5\u611f\u8bef\u4f1a #\u4eba\u751f\u9009\u62e9 #\u5267\u60c5\u53cd\u8f6c #\u70ed\u95e8\u5c0f\u8bf4",
      `${TEXT.forbidden}\uff1a${forbidden}`,
      `${TEXT.title}\uff1a${bookName}`,
      `${TEXT.description}\uff1a${description || ""}`,
    `${TEXT.content}\uff1a${context}`,
  ].join("\n");
}

function requestDeepSeekLabels(config, prompt) {
  return new Promise((resolve, reject) => {
    const target = getOpenAIChatCompletionsUrl(config.endpoint);
    const body = JSON.stringify(buildOpenAIChatBody(config, prompt));

    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        timeout: config.timeoutMs || DEFAULT_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`DeepSeek HTTP ${res.statusCode}: ${json.error?.message || data.slice(0, 200)}`));
              return;
            }
            resolve(json.choices?.[0]?.message?.content || "");
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("DeepSeek request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function requestDashScopeLabels(config, prompt) {
  return new Promise((resolve, reject) => {
    const base = String(config.endpoint || "").replace(/\/$/, "");
    const target = new URL(`${base}/services/aigc/text-generation/generation`);
    const body = JSON.stringify({
      model: config.model || "deepseek-v3",
      input: {
        messages: [
          { role: "system", content: "\u4f60\u53ea\u8f93\u51fa\u8bdd\u9898\uff0c\u4e0d\u8f93\u51fa\u89e3\u91ca\u3002" },
          { role: "user", content: prompt },
        ],
      },
      parameters: { result_format: "message", temperature: 0.8, max_tokens: 120, enable_thinking: false },
    });
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        timeout: config.timeoutMs || DEFAULT_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode < 200 || res.statusCode >= 300 || json.code) {
              reject(new Error(`DashScope HTTP ${res.statusCode}: ${json.message || json.code || data.slice(0, 200)}`));
              return;
            }
            resolve(json.output?.choices?.[0]?.message?.content || "");
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("DashScope request timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function selectLabelsWithFallback({
  bookName,
  description,
  novelText,
  forbiddenWords = [],
  customRulesText = "",
  configText = "",
  requestLabels,
}) {
  const config = parseDeepSeekConfig(configText);
  if (config.enabled && config.apiKey) {
    try {
      const prompt = buildAiTagPrompt(bookName, description, novelText, forbiddenWords);
      const client = requestLabels || (isDashScopeEndpoint(config.endpoint) ? requestDashScopeLabels : requestDeepSeekLabels);
      const raw = await client(config, prompt);
      const labels = cleanAiLabels(raw, forbiddenWords, customRulesText);
      if (labels.length >= 2 && labels.includes(HOT_TOPIC)) return labels;
    } catch {
      // Keep 7x24 running even if the AI service is slow or unavailable.
    }
  }
  return sanitizeLabels(buildSafeLabels(bookName, `${description || ""}\n${novelText || ""}`, forbiddenWords), { forbiddenWords, customRulesText });
}

module.exports = {
  buildAiTagPrompt,
  cleanAiLabels,
  parseDeepSeekConfig,
  isDashScopeEndpoint,
  isDashScopeOpenAICompatibleEndpoint,
  getOpenAIChatCompletionsUrl,
  buildOpenAIChatBody,
  requestDashScopeLabels,
  requestDeepSeekLabels,
  selectLabelsWithFallback,
};
