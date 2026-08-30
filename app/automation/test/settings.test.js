const assert = require("assert");
const { SCAN_PAGES } = require("../src/settings");

assert.strictEqual(SCAN_PAGES, 100);
console.log("settings tests passed");
