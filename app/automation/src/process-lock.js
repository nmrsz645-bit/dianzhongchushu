const fs = require("fs");
const path = require("path");
const { dataDir, ensureDir } = require("./paths");

const locksDir = path.join(dataDir, "locks");
const watchdogLockFile = path.join(dataDir, "watchdog.lock");

function isPidAlive(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return false;
  try {
    process.kill(id, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeLockAtomic(file, data) {
  ensureDir(path.dirname(file));
  const handle = fs.openSync(file, "wx");
  try {
    fs.writeFileSync(handle, JSON.stringify(data, null, 2), "utf8");
  } finally {
    fs.closeSync(handle);
  }
}

function acquireLock(file, options = {}) {
  const pid = options.pid || process.pid;
  const data = {
    pid,
    kind: options.kind || "lock",
    createdAt: new Date().toISOString(),
  };

  try {
    writeLockAtomic(file, data);
    return { acquired: true, file, pid };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  const existing = readLock(file);
  if (existing?.pid && isPidAlive(existing.pid)) {
    return { acquired: false, file, activePid: existing.pid, existing };
  }

  fs.rmSync(file, { force: true });
  try {
    writeLockAtomic(file, data);
    return { acquired: true, file, pid };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const current = readLock(file);
    return { acquired: false, file, activePid: current?.pid, existing: current };
  }
}

function releaseLock(lock) {
  if (!lock?.acquired || !lock.file) return;
  const existing = readLock(lock.file);
  if (!existing || Number(existing.pid) === Number(lock.pid || process.pid)) {
    fs.rmSync(lock.file, { force: true });
  }
}

async function withLock(file, options, fn) {
  const lock = acquireLock(file, options);
  if (!lock.acquired) return { acquired: false, lock };
  try {
    return { acquired: true, result: await fn(lock) };
  } finally {
    releaseLock(lock);
  }
}

function lockFileForBook(bookId) {
  const safeId = String(bookId || "").replace(/[^0-9A-Za-z_-]/g, "");
  return path.join(locksDir, `book-${safeId}.lock`);
}

module.exports = {
  acquireLock,
  isPidAlive,
  lockFileForBook,
  readLock,
  releaseLock,
  watchdogLockFile,
  withLock,
};
