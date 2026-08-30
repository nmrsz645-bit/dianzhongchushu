function isWechatSendEnabled(configText) {
  const value = String(configText || "").trim().toLowerCase();
  if (!value) return true;
  return !["关", "关闭", "off", "false", "0", "no"].includes(value);
}

module.exports = { isWechatSendEnabled };
