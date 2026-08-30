const fs = require("fs");
const path = require("path");
const { dataDir, ensureDir } = require("./paths");

const pendingFeishuDir = path.join(dataDir, "pending_feishu");

function pendingFile(bookId) {
  return path.join(pendingFeishuDir, `${String(bookId)}.json`);
}

function writeAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function savePendingFeishu(task) {
  const value = {
    ...task,
    bookId: String(task.bookId),
    updatedAt: new Date().toISOString(),
    createdAt: task.createdAt || new Date().toISOString(),
  };
  writeAtomic(pendingFile(value.bookId), value);
  return value;
}

function readPendingFeishu(bookId) {
  try {
    return JSON.parse(fs.readFileSync(pendingFile(bookId), "utf8"));
  } catch {
    return null;
  }
}

function listPendingFeishu() {
  try {
    return fs.readdirSync(pendingFeishuDir)
      .filter((name) => /^\d+\.json$/.test(name))
      .flatMap((name) => {
        try { return [JSON.parse(fs.readFileSync(path.join(pendingFeishuDir, name), "utf8"))]; }
        catch { return []; }
      });
  } catch {
    return [];
  }
}

function removePendingFeishu(bookId) {
  try { fs.unlinkSync(pendingFile(bookId)); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = {
  listPendingFeishu,
  pendingFeishuDir,
  readPendingFeishu,
  removePendingFeishu,
  savePendingFeishu,
};
