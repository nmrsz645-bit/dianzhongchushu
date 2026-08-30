const { log } = require("../automation/src/logger");
const { runFallbackOnce } = require("./run-once");

const FALLBACK_INTERVAL_MS = 5 * 60 * 60 * 1000;

let running = false;

async function run() {
  if (running) {
    log("兜底上一轮还在运行，本轮跳过");
    return;
  }
  running = true;
  try {
    await runFallbackOnce();
  } finally {
    running = false;
  }
}

log("兜底5小时监控启动");
run();
setInterval(run, FALLBACK_INTERVAL_MS);
