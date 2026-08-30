const fs = require("fs");

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isRetryableFileError(error) {
  return ["EBUSY", "EPERM", "EACCES"].includes(error?.code);
}

function appendFileWithRetry(file, content, options = {}) {
  const attempts = Math.max(1, options.attempts || 3);
  const delayMs = Math.max(0, options.delayMs ?? 50);
  const append = options.append || ((target, value) => fs.appendFileSync(target, value, "utf8"));
  const wait = options.wait || sleepSync;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      append(file, content);
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!isRetryableFileError(error) || attempt === attempts) break;
      wait(delayMs * attempt);
    }
  }
  return { ok: false, attempts, error: lastError };
}

module.exports = { appendFileWithRetry, isRetryableFileError };
