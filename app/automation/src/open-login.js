const { openContext } = require("./browser");
const { log } = require("./logger");
const { readTextFile } = require("./paths");

async function main() {
  const { page } = await openContext();
  await page.goto(readTextFile("网址.txt"), { waitUntil: "domcontentloaded", timeout: 60000 });
  log("登录页面已打开。请在 Chrome 中确认登录状态，登录后可以直接关闭此窗口或保留。");
}

main().catch((error) => {
  log(`打开登录页面失败：${error.stack || error.message}`);
  process.exitCode = 1;
});
