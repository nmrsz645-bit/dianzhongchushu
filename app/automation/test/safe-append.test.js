const assert = require("assert");
const { appendFileWithRetry } = require("../src/safe-append");

let calls = 0;
const recovered = appendFileWithRetry("unused", "line", {
  attempts: 3,
  delayMs: 0,
  wait: () => {},
  append: () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("busy"), { code: "EBUSY" });
  },
});
assert.strictEqual(recovered.ok, true);
assert.strictEqual(recovered.attempts, 3);

const unavailable = appendFileWithRetry("unused", "line", {
  attempts: 2,
  delayMs: 0,
  wait: () => {},
  append: () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); },
});
assert.strictEqual(unavailable.ok, false);
assert.strictEqual(unavailable.error.code, "EBUSY");

console.log("safe-append tests passed");
