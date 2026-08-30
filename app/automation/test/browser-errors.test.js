const assert = require("assert");
const { BrowserSessionError, isBrowserSessionError } = require("../src/browser");

assert.strictEqual(isBrowserSessionError(new BrowserSessionError("profile busy")), true);
assert.strictEqual(isBrowserSessionError(new Error("page.goto: Target page, context or browser has been closed")), true);
assert.strictEqual(isBrowserSessionError(new Error("Failed to launch browser because ProcessSingleton failed")), true);
assert.strictEqual(isBrowserSessionError(new Error("该书籍未审核通过")), false);

console.log("browser-errors tests passed");
