const fs = require("fs");
const { chromium } = require("playwright-core");
const { chromeProfileDir, ensureDir, readTextFile } = require("./paths");

function findChromeExecutable() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (!found) throw new Error("没有找到 Google Chrome，请先安装 Chrome");
  return found;
}

function platformOrigin() {
  const url = new URL(readTextFile("网址.txt"));
  return url.origin;
}

class BrowserSessionError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "BrowserSessionError";
    this.code = "BROWSER_SESSION_UNAVAILABLE";
    this.isGlobalFailure = true;
  }
}

function isBrowserSessionError(error) {
  if (error?.code === "BROWSER_SESSION_UNAVAILABLE" || error?.isGlobalFailure) return true;
  const text = String(error?.message || error || "").toLowerCase();
  return [
    "target page, context or browser has been closed",
    "browser has been closed",
    "failed to launch browser",
    "processsingleton",
    "user data directory is already in use",
    "executable doesn't exist",
    "browser.newpage: target page",
    "page.goto: target page",
  ].some((pattern) => text.includes(pattern));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function openContext() {
  ensureDir(chromeProfileDir);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const context = await chromium.launchPersistentContext(chromeProfileDir, {
        executablePath: findChromeExecutable(),
        headless: false,
        viewport: null,
        args: ["--start-maximized", "--no-first-run"],
      });
      const page = context.pages()[0] || await context.newPage();
      return { context, page, origin: platformOrigin() };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(1000 * attempt);
    }
  }
  throw new BrowserSessionError(`Chrome 启动或用户目录被占用，已重试 3 次：${lastError?.message || lastError}`, lastError);
}

module.exports = { BrowserSessionError, isBrowserSessionError, openContext, platformOrigin };
