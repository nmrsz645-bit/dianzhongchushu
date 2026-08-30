const assert = require("assert");
const { isWechatSendEnabled } = require("../src/wechat-send-setting");

assert.strictEqual(isWechatSendEnabled(""), true);
assert.strictEqual(isWechatSendEnabled("开"), true);
assert.strictEqual(isWechatSendEnabled("开启"), true);
assert.strictEqual(isWechatSendEnabled("on"), true);
assert.strictEqual(isWechatSendEnabled("关"), false);
assert.strictEqual(isWechatSendEnabled("关闭"), false);
assert.strictEqual(isWechatSendEnabled("off"), false);
assert.strictEqual(isWechatSendEnabled("0"), false);

console.log("wechat-send-setting tests passed");
