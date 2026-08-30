const fs = require("fs");
const https = require("https");

const MAX_FEISHU_LABEL_LENGTH = 55;

function toFeishuBookName(bookName) {
  return String(bookName || "").replace(/\u5c0f\u4e09/g, "\u524d\u4efb");
}
const HOT_TOPIC = "#热门小说";

function requestJson(method, url, token, bodyObject) {
  return new Promise((resolve, reject) => {
    const body = bodyObject ? JSON.stringify(bodyObject) : "";
    const target = new URL(url);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = https.request({ hostname: target.hostname, path: `${target.pathname}${target.search}`, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseFeishuConfig(text) {
  const appId = String(text).match(/App ID\s*[:：]\s*(\S+)/i)?.[1];
  const appSecret = String(text).match(/App Secret\s*[:：]\s*(\S+)/i)?.[1];
  const link = String(text).match(/https?:\/\/\S+/)?.[0];
  if (!appId || !appSecret || !link) throw new Error("飞书接口和链接.txt 缺 App ID / App Secret / 文档链接");
  return { appId, appSecret, link };
}

function formatFeishuLabel(bookName, labels) {
  const cleanName = String(bookName || "").replace(/[《》]/g, "").trim();
  let text = `《${cleanName}》`;
  const cleanLabels = (labels || []).map((label) => String(label || "").trim()).filter(Boolean);
  const hasHotTopic = cleanLabels.includes(HOT_TOPIC);
  const otherLabels = cleanLabels.filter((label) => label !== HOT_TOPIC);
  const hotSuffix = hasHotTopic ? ` ${HOT_TOPIC}` : "";

  if (text.length + hotSuffix.length >= MAX_FEISHU_LABEL_LENGTH) return `${text}${hotSuffix}`;

  for (const token of otherLabels) {
    const next = `${text} ${token}`;
    if (`${next}${hotSuffix}`.length <= MAX_FEISHU_LABEL_LENGTH) text = next;
  }
  return `${text}${hotSuffix}`;
}

function buildCompleteFeishuRow({ date, bookName, labelText, startPage, startParam }) {
  if (!startPage) throw new Error("缺少启动页，不能写入飞书完整行");
  if (!startParam) throw new Error("缺少启动参数，不能写入飞书完整行");
  return [date, bookName, "", "", labelText, startPage, startParam];
}

function isEmptyAtoG(row) {
  return Array.from({ length: 7 }, (_, index) => (row || [])[index]).every(
    (cell) => cell === undefined || cell === null || String(cell).trim() === ""
  );
}

function firstEmptyAtoGRow(values) {
  for (let index = 1; index < values.length; index += 1) {
    if (isEmptyAtoG(values[index])) return index + 1;
  }
  return Math.max(values.length + 1, 2);
}

function hasBookNameInRows(values, bookName) {
  const target = String(bookName || "").trim();
  if (!target) return false;
  return (values || []).slice(1).some((row) => String((row || [])[1] || "").trim() === target);
}

function nextManualBookName(values, bookName) {
  const cleanName = String(bookName || "").replace(/[《》]/g, "").trim();
  const existing = (values || []).slice(1).map((row) => String((row || [])[1] || "").trim());
  const base = `《${cleanName}》`;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const repeatCount = existing.filter((name) => new RegExp(`^${escaped}-*$`).test(name)).length;
  if (!existing.includes(cleanName) && repeatCount === 0) return cleanName;
  return `${base}${"-".repeat(repeatCount)}`;
}

function buildCompletedBookIndex(values) {
  const names = new Set();
  const ids = new Set();
  for (const row of (values || []).slice(1)) {
    const name = String((row || [])[1] || "").trim();
    const id = String((row || [])[6] || "").match(/bookId=(\d+)/)?.[1];
    if (name) names.add(name);
    if (id) ids.add(id);
  }
  return { ids, names };
}

async function resolveFeishu(file) {
  const config = parseFeishuConfig(fs.readFileSync(file, "utf8"));
  const tokenResult = await requestJson("POST", "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", null, {
    app_id: config.appId,
    app_secret: config.appSecret,
  });
  if (tokenResult.code !== 0) throw new Error(`获取飞书 token 失败：${JSON.stringify(tokenResult)}`);
  const tenantAccessToken = tokenResult.tenant_access_token;

  const spreadsheetToken = await resolveSpreadsheetToken(config.link, tenantAccessToken);
  const sheets = await requestJson("GET", `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`, tenantAccessToken);
  if (sheets.code !== 0) throw new Error(`读取飞书工作表失败：${JSON.stringify(sheets)}`);
  const sheet = (sheets.data.sheets || []).find((item) => !item.hidden) || (sheets.data.sheets || [])[0];
  if (!sheet) throw new Error("飞书表格没有工作表");
  return { tenantAccessToken, spreadsheetToken, sheetId: sheet.sheet_id };
}

async function resolveSpreadsheetToken(link, token) {
  const direct = String(link).match(/\/sheets\/([^/?]+)/)?.[1];
  if (direct) return direct;
  const wikiToken = String(link).match(/\/wiki\/([^?]+)/)?.[1];
  if (!wikiToken) throw new Error("飞书链接里没有 wiki 或 sheets token");
  const result = await requestJson("GET", `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${wikiToken}`, token);
  if (result.code !== 0) throw new Error(`解析飞书 wiki 失败：${JSON.stringify(result)}`);
  if (result.data.node.obj_type !== "sheet") throw new Error(`飞书链接不是电子表格：${result.data.node.obj_type}`);
  return result.data.node.obj_token;
}

async function readValues(ctx, range) {
  const result = await requestJson(
    "GET",
    `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${ctx.spreadsheetToken}/values/${encodeURIComponent(range)}`,
    ctx.tenantAccessToken
  );
  if (result.code !== 0) throw new Error(`读取飞书单元格失败：${JSON.stringify(result)}`);
  return result.data.valueRange.values || [];
}

async function writeValues(ctx, range, values) {
  const result = await requestJson("PUT", `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${ctx.spreadsheetToken}/values`, ctx.tenantAccessToken, {
    valueRange: { range, values },
  });
  if (result.code !== 0) throw new Error(`写入飞书失败：${JSON.stringify(result)}`);
  return result;
}

module.exports = {
  buildCompletedBookIndex,
  buildCompleteFeishuRow,
  firstEmptyAtoGRow,
  formatFeishuLabel,
  hasBookNameInRows,
  nextManualBookName,
  parseFeishuConfig,
  readValues,
  requestJson,
  resolveFeishu,
  resolveSpreadsheetToken,
  toFeishuBookName,
  writeValues,
};
