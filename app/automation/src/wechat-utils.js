const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

function extractWechatKey(webhookText) {
  const key = String(webhookText || "").match(/key=([a-zA-Z0-9_-]+)/)?.[1];
  if (!key) throw new Error("企业微信接口里没有 key=");
  return key;
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function uploadWechatFile(key, filePath) {
  const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${key}&type=file`;
  return new Promise((resolve, reject) => {
    const child = spawn("curl.exe", ["-s", "-F", `media=@${filePath};filename=${path.basename(filePath)};type=text/plain`, uploadUrl], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `curl exited ${code}`));
      else resolve(JSON.parse(stdout));
    });
  });
}

async function sendWechatFile(webhookText, filePath) {
  const key = extractWechatKey(webhookText);
  const upload = await uploadWechatFile(key, filePath);
  if (upload.errcode !== 0) throw new Error(`企业微信上传失败：${JSON.stringify(upload)}`);
  const send = await postJson(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`, JSON.stringify({ msgtype: "file", file: { media_id: upload.media_id } }));
  if (send.errcode !== 0) throw new Error(`企业微信发送失败：${JSON.stringify(send)}`);
  return { upload, send };
}

async function sendWechatText(webhookText, content) {
  const key = extractWechatKey(webhookText);
  const send = await postJson(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`, JSON.stringify({ msgtype: "text", text: { content } }));
  if (send.errcode !== 0) throw new Error(`企业微信发送文字失败：${JSON.stringify(send)}`);
  return send;
}

module.exports = { extractWechatKey, sendWechatFile, sendWechatText };
