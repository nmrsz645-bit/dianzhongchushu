const fs = require("fs");
const path = require("path");

const automationDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(automationDir, "..");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readTextFile(fileName, required = true) {
  const file = path.join(rootDir, fileName);
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`缺少配置文件：${file}`);
    return "";
  }
  return fs.readFileSync(file, "utf8").trim();
}

function writeTextFile(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf8");
}

module.exports = {
  automationDir,
  rootDir,
  dataDir: path.join(automationDir, "data"),
  logDir: path.join(automationDir, "logs"),
  failedDir: path.join(automationDir, "failed"),
  chromeProfileDir: path.join(rootDir, "ChromeProfile"),
  novelOriginalDir: path.join(rootDir, "\u5c0f\u8bf4\u539f\u6587"),
  movableNovelDir: path.join(rootDir, "\u53ef\u6539\u5c0f\u8bf4"),
  ensureDir,
  readTextFile,
  writeTextFile,
};
