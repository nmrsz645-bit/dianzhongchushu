const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");
const pathsFile = require.resolve(path.join(SRC_DIR, "paths.js"));
const pendingFile = require.resolve(path.join(SRC_DIR, "pending-feishu.js"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dz-pending-feishu-"));

require.cache[pathsFile] = {
  id: pathsFile,
  filename: pathsFile,
  loaded: true,
  exports: {
    dataDir: tempDir,
    ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  },
};

try {
  const pending = require("../src/pending-feishu");
  pending.savePendingFeishu({ bookId: "11000000001", bookName: "测试书", startPage: "pages/index" });
  assert.strictEqual(pending.listPendingFeishu().length, 1);
  assert.strictEqual(pending.readPendingFeishu("11000000001").bookName, "测试书");

  pending.savePendingFeishu({ ...pending.readPendingFeishu("11000000001"), feishuWrittenAt: "2026-08-20T00:00:00.000Z" });
  assert.strictEqual(pending.readPendingFeishu("11000000001").feishuWrittenAt, "2026-08-20T00:00:00.000Z");

  pending.removePendingFeishu("11000000001");
  assert.strictEqual(pending.listPendingFeishu().length, 0);
  console.log("pending-feishu tests passed");
} finally {
  delete require.cache[pendingFile];
  delete require.cache[pathsFile];
  fs.rmSync(tempDir, { recursive: true, force: true });
}
