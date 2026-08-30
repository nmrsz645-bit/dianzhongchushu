const assert = require("assert");
const { expiredLogFiles, logFileNameForDate } = require("../src/logger");

assert.strictEqual(logFileNameForDate(new Date("2026-07-05T12:00:00+08:00")), "run-2026-07-05.log");
assert.deepStrictEqual(expiredLogFiles([
  "run-2026-06-28.log",
  "run-2026-06-29.log",
  "run-2026-07-01.log",
  "manual.txt",
], new Date("2026-07-05T12:00:00+08:00")), ["run-2026-06-28.log"]);
console.log("logger tests passed");
