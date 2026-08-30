const fs = require("fs");
const path = require("path");
const { buildCompletedBookIndex, readValues, requestJson, resolveFeishu, resolveSpreadsheetToken } = require("../automation/src/feishu-utils");
const { log } = require("../automation/src/logger");
const { notifyOrQueueWechat } = require("../automation/src/notification-utils");
const { processBook } = require("../automation/src/run-book");
const { rootDir, ensureDir } = require("../automation/src/paths");
const { isBrowserSessionError, openContext } = require("../automation/src/browser");
const { isPendingOutputError } = require("../automation/src/run-book");
const { appendFileWithRetry } = require("../automation/src/safe-append");
const { findPromotionBookById } = require("../automation/src/platform-browser");
const { todayChinaDate } = require("../automation/src/platform-utils");
const { recordTodayDetectedBooks, refreshDailyStatus } = require("../automation/src/status-utils");
const { buildFailureQueueItem } = require("../automation/src/fallback-failure-utils");
const { isBookCompletedByOutput, parseFallbackBooks, uniqueBooks } = require("./fallback-utils");

const FALLBACK_DIR = __dirname;
const LINKS_FILE = path.join(FALLBACK_DIR, "新建文本文档.txt");
const STATE_FILE = path.join(FALLBACK_DIR, "兜底状态.json");
const LOG_FILE = path.join(FALLBACK_DIR, "兜底日志.txt");
const FEISHU_FILE = path.join(rootDir, "飞书接口和链接.txt");
const MAX_FAIL_COUNT = 48;

function fallbackLog(message) {
  ensureDir(FALLBACK_DIR);
  const line = `[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] ${message}`;
  const result = appendFileWithRetry(LOG_FILE, `${line}\n`);
  if (!result.ok) {
    log(`兜底日志文件暂时无法写入，业务继续；原因：${result.error?.code || "unknown"} ${result.error?.message || result.error}`);
  }
  log(`兜底：${message}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function linksFromText(text) {
  return String(text || "").match(/https?:\/\/\S+/g) || [];
}

function parseFeishuCreds(file) {
  const text = fs.readFileSync(file, "utf8");
  const appId = text.match(/App ID\s*[:：]\s*(\S+)/i)?.[1];
  const appSecret = text.match(/App Secret\s*[:：]\s*(\S+)/i)?.[1];
  if (!appId || !appSecret) throw new Error("飞书接口和链接.txt 缺 App ID / App Secret");
  return { appId, appSecret };
}

async function tenantToken() {
  const { appId, appSecret } = parseFeishuCreds(FEISHU_FILE);
  const result = await requestJson("POST", "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", null, {
    app_id: appId,
    app_secret: appSecret,
  });
  if (result.code !== 0) throw new Error(`获取飞书 token 失败：${JSON.stringify(result)}`);
  return result.tenant_access_token;
}

async function readFallbackSheetBooks(link, token, today) {
  const spreadsheetToken = await resolveSpreadsheetToken(link, token);
  const sheets = await requestJson("GET", `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`, token);
  if (sheets.code !== 0) throw new Error(`读取兜底工作表失败：${JSON.stringify(sheets)}`);
  const sheet = (sheets.data.sheets || []).find((item) => !item.hidden) || (sheets.data.sheets || [])[0];
  if (!sheet) return [];
  const values = await requestJson(
    "GET",
    `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodeURIComponent(`${sheet.sheet_id}!A1:Z5000`)}`,
    token
  );
  if (values.code !== 0) throw new Error(`读取兜底表格内容失败：${JSON.stringify(values)}`);
  return parseFallbackBooks(values.data.valueRange.values || [], today).map((book) => ({ ...book, source: sheet.title }));
}

async function readCompletedOutputIndex() {
  const feishu = await resolveFeishu(FEISHU_FILE);
  const values = await readValues(feishu, `${feishu.sheetId}!A:G`);
  return buildCompletedBookIndex(values);
}

function shouldTryBook(book, item, now) {
  if (item?.successAt) return false;
  if (item?.skippedDate === book.rowDate && item?.skipReason !== "platform book not found") return false;
  if ((item?.failCount || 0) >= MAX_FAIL_COUNT) return false;
  if (item?.nextRetryAt && Date.parse(item.nextRetryAt) > now.getTime()) return false;
  return true;
}

async function openCheckedBookContext(book) {
  const browserContext = await openContext();
  try {
    const platformBook = await findPromotionBookById(browserContext.page, browserContext.origin, book.id);
    const listedAt = platformBook?.listedAt || "";
    if (!platformBook) return { ...browserContext, failureReason: "平台搜不到书籍ID", listedAt };
    return { ...browserContext, listedAt };
  } catch (error) {
    await browserContext.context.close().catch(() => {});
    throw error;
  }
}

async function runFallbackOnce() {
  if (!fs.existsSync(LINKS_FILE)) {
    fallbackLog("未找到兜底链接文本，跳过");
    return { checked: 0, processed: 0 };
  }
  const today = todayChinaDate();
  const state = readJson(STATE_FILE, { books: {}, terminalFailures: [] });
  const token = await tenantToken();
  const links = linksFromText(fs.readFileSync(LINKS_FILE, "utf8"));
  const lists = [];
  for (const link of links) {
    lists.push(...await readFallbackSheetBooks(link, token, today));
  }
  const todayBooks = uniqueBooks(lists);
  recordTodayDetectedBooks(todayBooks.map((book) => ({
    bookId: book.id,
    source: "fallback",
    sourceDate: book.rowDate,
    bookName: book.name,
    listedAt: book.rowDate,
  })));
  const discoveredAt = new Date().toISOString();
  for (const book of todayBooks) {
    const previous = state.books[book.id] || {};
    state.books[book.id] = {
      ...previous,
      bookId: book.id,
      bookName: previous.bookName || book.name,
      source: previous.source || book.source,
      rowDate: previous.rowDate || book.rowDate,
      discoveredAt: previous.discoveredAt || discoveredAt,
      status: previous.successAt ? "completed" : ((previous.failCount || 0) > 0 ? "retrying" : "pending"),
    };
  }
  writeJson(STATE_FILE, state);
  refreshDailyStatus();
  const outputIndex = await readCompletedOutputIndex();
  let processed = 0;
  fallbackLog(`本轮读取今日书籍 ${todayBooks.length} 本，已出书 ${outputIndex.ids.size} 本`);

  for (const book of todayBooks) {
    const item = state.books[book.id] || {};
    if (isBookCompletedByOutput(outputIndex, book)) {
      state.books[book.id] = { ...item, bookId: book.id, bookName: book.name, successAt: item.successAt || new Date().toISOString(), source: book.source, status: "completed" };
      outputIndex.ids.add(book.id);
      outputIndex.names.add(book.name);
      fallbackLog(`兜底已在完成表找到同书名或同ID，标记完成并跳过：${book.id} ${book.name}`);
      continue;
    }
    if (!shouldTryBook(book, item, new Date())) continue;

    let browserContext = null;
    try {
      browserContext = await openCheckedBookContext(book);
      if (browserContext.failureReason) {
        const failureItem = buildFailureQueueItem(book, item, browserContext.failureReason);
        state.books[book.id] = {
          ...failureItem,
          listedAt: browserContext.listedAt,
        };
        fallbackLog(`兜底出书失败：${book.id}，第 ${failureItem.failCount}/${MAX_FAIL_COUNT} 次，原因：${failureItem.reason}`);
        if (failureItem.failCount >= MAX_FAIL_COUNT) {
          state.terminalFailures = state.terminalFailures || [];
          state.terminalFailures.push({ bookId: book.id, bookName: book.name, source: book.source, discoveredAt: failureItem.discoveredAt, reason: failureItem.reason, failCount: failureItem.failCount, failedAt: new Date().toISOString() });
          state.books[book.id] = { ...failureItem, status: "terminal", terminalFailedAt: new Date().toISOString() };
          await notifyOrQueueWechat(`兜底彻底失败书籍id${book.id}失败原因${failureItem.reason}`).catch(() => {});
        }
        writeJson(STATE_FILE, state);
        continue;
      }
      fallbackLog(`开始兜底出书：${book.id} ${book.name}`);
      await processBook(book.id, browserContext);
      processed += 1;
      outputIndex.ids.add(book.id);
      outputIndex.names.add(book.name);
      state.books[book.id] = { bookId: book.id, bookName: book.name, source: book.source, rowDate: book.rowDate, listedAt: browserContext.listedAt, discoveredAt: item.discoveredAt || discoveredAt, successAt: new Date().toISOString(), failCount: item.failCount || 0, status: "completed" };
      fallbackLog(`兜底出书成功：${book.id}`);
    } catch (error) {
      const reason = String(error?.message || error || "").slice(0, 1000);
      if (isBrowserSessionError(error)) {
        fallbackLog(`浏览器全局故障，本轮停止且不增加兜底书籍失败次数：${reason}`);
        throw error;
      }
      if (isPendingOutputError(error)) {
        fallbackLog(`推广后任务已进入待恢复区，不增加兜底失败次数：${book.id}，原因：${reason}`);
        writeJson(STATE_FILE, state);
        continue;
      }
      const failureItem = buildFailureQueueItem(book, item, reason);
      state.books[book.id] = failureItem;
      fallbackLog(`兜底出书失败：${book.id}，第 ${failureItem.failCount}/${MAX_FAIL_COUNT} 次，原因：${reason}`);
      if (failureItem.failCount >= MAX_FAIL_COUNT) {
        state.terminalFailures = state.terminalFailures || [];
        state.terminalFailures.push({ bookId: book.id, bookName: book.name, source: book.source, discoveredAt: failureItem.discoveredAt, reason, failCount: failureItem.failCount, failedAt: new Date().toISOString() });
        state.books[book.id] = { ...failureItem, status: "terminal", terminalFailedAt: new Date().toISOString() };
        await notifyOrQueueWechat(`兜底彻底失败书籍id${book.id}失败原因${reason}`).catch(() => {});
      }
    } finally {
      if (browserContext) await browserContext.context.close().catch(() => {});
    }
    writeJson(STATE_FILE, state);
  }

  writeJson(STATE_FILE, state);
  refreshDailyStatus();
  return { checked: todayBooks.length, processed };
}

if (require.main === module) {
  runFallbackOnce().catch(async (error) => {
    fallbackLog(`兜底运行失败：${error.stack || error.message}`);
    await notifyOrQueueWechat(`点重兜底全局错误：${String(error?.message || error || "")}`).catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { runFallbackOnce, buildFailureQueueItem };
