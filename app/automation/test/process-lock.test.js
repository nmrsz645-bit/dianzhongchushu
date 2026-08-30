const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  acquireLock,
  lockFileForBook,
  readLock,
  releaseLock,
  withLock,
} = require("../src/process-lock");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dz-lock-"));
}

function testAcquireLockRejectsLivePid() {
  const dir = tempDir();
  try {
    const file = path.join(dir, "watchdog.lock");
    const first = acquireLock(file, { pid: process.pid, kind: "test" });
    const second = acquireLock(file, { pid: process.pid, kind: "test" });
    assert.strictEqual(first.acquired, true);
    assert.strictEqual(second.acquired, false);
    assert.strictEqual(second.activePid, process.pid);
    releaseLock(first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testAcquireLockReplacesStalePid() {
  const dir = tempDir();
  try {
    const file = path.join(dir, "watchdog.lock");
    fs.writeFileSync(file, JSON.stringify({ pid: 99999999, createdAt: "old" }), "utf8");
    const lock = acquireLock(file, { pid: process.pid, kind: "test" });
    assert.strictEqual(lock.acquired, true);
    assert.strictEqual(readLock(file).pid, process.pid);
    releaseLock(lock);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testWithLockReleasesAfterSuccess() {
  const dir = tempDir();
  try {
    const file = path.join(dir, "book.lock");
    const result = await withLock(file, { pid: process.pid, kind: "book" }, async () => "ok");
    assert.deepStrictEqual(result, { acquired: true, result: "ok" });
    assert.strictEqual(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testBookLockFileSanitizesId() {
  const file = lockFileForBook("11010519846/../x");
  assert(file.endsWith("book-11010519846x.lock"));
}

(async () => {
  testAcquireLockRejectsLivePid();
  testAcquireLockReplacesStalePid();
  await testWithLockReleasesAfterSuccess();
  testBookLockFileSanitizesId();
  console.log("process-lock tests passed");
})();
