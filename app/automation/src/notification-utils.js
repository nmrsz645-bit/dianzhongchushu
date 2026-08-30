const { readTextFile } = require("./paths");
const {
  buildNotificationQueueState,
  markNotificationError,
  readNotificationQueue,
  removeNotification,
  writeNotificationQueue,
} = require("./state");
const { sendWechatText } = require("./wechat-utils");

function enqueueWechatNotification(content) {
  writeNotificationQueue(buildNotificationQueueState(readNotificationQueue(), content));
}

async function flushWechatNotifications() {
  let state = readNotificationQueue();
  if (!state.items.length) return;
  const webhook = readTextFile("企业微信.txt");
  for (const item of [...state.items]) {
    try {
      await sendWechatText(webhook, item.content);
      state = removeNotification(readNotificationQueue(), item.id);
      writeNotificationQueue(state);
    } catch (error) {
      writeNotificationQueue(markNotificationError(readNotificationQueue(), item.id, error));
      break;
    }
  }
}

async function notifyOrQueueWechat(content) {
  enqueueWechatNotification(content);
  await flushWechatNotifications();
}

module.exports = { enqueueWechatNotification, flushWechatNotifications, notifyOrQueueWechat };
