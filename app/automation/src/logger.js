const fs = require("fs");
const path = require("path");
const { ensureDir, logDir } = require("./paths");

const LOG_RETENTION_DAYS = 7;

function chinaDateParts(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
}

function nowChinaText(date = new Date()) {
  const parts = chinaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function logFileNameForDate(date = new Date()) {
  const parts = chinaDateParts(date);
  return `run-${parts.year}-${parts.month}-${parts.day}.log`;
}

function dayNumberFromLogName(name) {
  const match = String(name || "").match(/^run-(\d{4})-(\d{2})-(\d{2})\.log$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function chinaDayNumber(date = new Date()) {
  const parts = chinaDateParts(date);
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
}

function expiredLogFiles(names, now = new Date()) {
  const cutoff = chinaDayNumber(now) - (LOG_RETENTION_DAYS - 1);
  return Array.from(names || []).filter((name) => {
    const day = dayNumberFromLogName(name);
    return day !== null && day < cutoff;
  });
}

function cleanupOldLogs(now = new Date()) {
  ensureDir(logDir);
  for (const name of expiredLogFiles(fs.readdirSync(logDir), now)) {
    fs.unlinkSync(path.join(logDir, name));
  }
}

function log(message) {
  ensureDir(logDir);
  const now = new Date();
  cleanupOldLogs(now);
  const line = `[${nowChinaText(now)}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(logDir, logFileNameForDate(now)), `${line}\n`, "utf8");
}

module.exports = { cleanupOldLogs, expiredLogFiles, log, logFileNameForDate, nowChinaText };
