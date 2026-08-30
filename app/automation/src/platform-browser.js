const { extractFirstDateTime, parseBookRowsFromCellRows, pickDownloadableChapters, pickReferralFromRows } = require("./platform-utils");

async function gotoPath(page, origin, path) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
}

async function openPromotionList(page, origin) {
  await gotoPath(page, origin, "/admin/bookshort/book/channelindex?addtabs=1");
  await page.waitForSelector("table", { timeout: 30000 }).catch(() => {});
  await assertLoggedIn(page);
}

async function assertLoggedIn(page) {
  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const url = page.url();
  if (/login|signin/i.test(url) || (bodyText.includes("登录") && bodyText.includes("密码") && !bodyText.includes("书籍id"))) {
    throw new Error("点重后台登录失效，请重新登录");
  }
}

async function readCurrentPromotionRows(page) {
  const cellRows = await page.evaluate(() => Array.from(document.querySelectorAll("table tr[data-index]")).map((tr) => {
    return Array.from(tr.querySelectorAll("td")).map((td) => (td.innerText || "").trim());
  }));
  return parseBookRowsFromCellRows(cellRows);
}

async function setPromotionBookIdFilter(page, bookId) {
  const found = await page.evaluate((value) => {
    const inputs = Array.from(document.querySelectorAll("input")).filter((input) => input.type !== "hidden");
    const scored = inputs.map((input) => {
      const text = [
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute("aria-label"),
        input.closest(".form-group")?.innerText,
        input.parentElement?.innerText,
      ].filter(Boolean).join(" ");
      let score = 0;
      if (/book/i.test(text)) score += 3;
      if (/id/i.test(text)) score += 2;
      if (/书籍|小说/.test(text)) score += 3;
      if (/ID|id/.test(text)) score += 2;
      return { input, score };
    }).sort((a, b) => b.score - a.score);
    const target = scored.find((item) => item.score > 0)?.input;
    if (!target) return false;
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, String(bookId));
  if (!found) throw new Error("No promotion book id filter found");
}

async function findPromotionBookById(page, origin, bookId) {
  await openPromotionList(page, origin);
  await setPromotionBookIdFilter(page, bookId);
  await page.locator('button[type="submit"]').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  return (await readCurrentPromotionRows(page)).find((row) => String(row.id) === String(bookId)) || null;
}

async function clickNextPromotionPage(page) {
  const next = page.locator(".fixed-table-pagination li.page-next a").first();
  const disabled = await next.evaluate((el) => {
    const item = el.closest("li");
    return item?.classList.contains("disabled") || el.getAttribute("disabled") != null;
  }).catch(() => true);
  if (disabled) return false;
  await next.click();
  await page.waitForTimeout(1200);
  return true;
}

async function searchBookAndOpenInfo(page, origin, bookId) {
  await gotoPath(page, origin, `/admin/bookshort/book/info?bookId=${bookId}`);
}

async function extractBookInfo(page) {
  const bodyText = await page.locator("body").innerText({ timeout: 30000 });
  const name = bodyText.match(/\u5c0f\u8bf4\u540d\u79f0:\s*([^\n]+)/)?.[1]?.trim() || "";
  const description = bodyText.match(/\u63cf\u8ff0:\s*([\s\S]*?)\n\s*\u6279\u91cf\u4e0b\u8f7d/)?.[1]?.trim() || "";
  return { name, description, listedAt: extractFirstDateTime(bodyText) };
}

async function listChapters(page) {
  await page.waitForSelector("tr[data-index]", { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tr"));
    return rows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.innerText || "").trim());
      const chapterLink = tr.querySelector('a[href*="/admin/bookshort/book/chapter?"]');
      const downloadLink = tr.querySelector('a[href*="/admin/bookshort/book/chapterdown?"]');
      const referralLink = tr.querySelector('a[href*="/admin/referral/referral/add?"]');
      return {
        chapterNo: cells[1] || "",
        title: (chapterLink?.innerText || cells[1] || "").trim(),
        href: chapterLink?.getAttribute("href") || "",
        downloadText: downloadLink ? "\u4e0b\u8f7d" : "-",
        referralHref: referralLink?.getAttribute("href") || "",
      };
    }).filter((row) => row.chapterNo && row.title);
  });
}

async function readChapterText(page, origin, chapterHref) {
  await gotoPath(page, origin, chapterHref);
  const lines = await page.locator(".chaptertext p").allTextContents();
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

async function openFirstChapterReferral(page, origin, referralHref) {
  await gotoPath(page, origin, referralHref.includes("?") ? `${referralHref}&dialog=1` : `${referralHref}?dialog=1`);
}

async function createReferralLink(page, resourceId) {
  await page.locator('input[name="row[name]"]').fill("1");
  await page.locator('input[name="row[media_source]"][value="dy"]').check({ force: true });
  await page.locator('input[name="row[callbacktype]"][value="1"]').check({ force: true });
  await selectResource(page, resourceId);
  await page.locator('button[type="submit"]').filter({ hasText: "\u786e\u5b9a" }).click();
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const errorLine = bodyText.split(/\r?\n/).find((line) => /(不允许创建推广链接|未审核通过|失败|错误|请选择|不能为空|不存在)/.test(line));
  if (errorLine) throw new Error(`创建推广链接失败：${errorLine.trim()}`);
}

async function selectResource(page, resourceId) {
  const resourceText = String(resourceId).trim();
  const input = page.locator('input[name="row[callback_config_id]"]');
  if ((await input.count()) !== 1) throw new Error("No callback_config_id field found");
  await input.evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, resourceText);
}

async function readLatestReferral(page, origin, expectedBookName, options = {}) {
  await gotoPath(page, origin, "/admin/referral/referral/bookshort_index?addtabs=1");
  await page.waitForSelector("table", { timeout: 30000 }).catch(() => {});
  if (options.bookId) {
    await page.evaluate((bookId) => {
      for (const selector of ['input[name="book_id_text"]', 'input[name="book_id"]']) {
        const input = document.querySelector(selector);
        if (!input) continue;
        input.value = bookId;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, String(options.bookId));
    await page.locator('button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll("table tbody tr")).map((tr) => ({
    text: tr.innerText || "",
    links: Array.from(tr.querySelectorAll('a[title="\u70b9\u51fb\u590d\u5236"]')).map((a) => (a.innerText || "").trim()).filter(Boolean),
  })));
  return pickReferralFromRows(rows, expectedBookName, options.bookId);
}

async function waitLatestReferral(page, origin, expectedBookName, options = {}) {
  const timeoutMs = options.timeoutMs || 90000;
  const intervalMs = options.intervalMs || 3000;
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() <= deadline) {
    latest = await readLatestReferral(page, origin, expectedBookName, options);
    if (latest?.startPage && latest?.startParam) return latest;
    await page.waitForTimeout(intervalMs);
  }
  return latest;
}

module.exports = {
  assertLoggedIn,
  createReferralLink,
  extractBookInfo,
  findPromotionBookById,
  listChapters,
  clickNextPromotionPage,
  openPromotionList,
  openFirstChapterReferral,
  pickDownloadableChapters,
  readChapterText,
  readCurrentPromotionRows,
  readLatestReferral,
  waitLatestReferral,
  searchBookAndOpenInfo,
};
