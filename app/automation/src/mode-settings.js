const fs = require("fs");
const path = require("path");
const { rootDir, ensureDir } = require("./paths");

const MODE_FILE = path.join(rootDir, "自动化模式.json");

function normalizeModeSettings(settings = {}) {
  const platformEnabled = settings.platformEnabled !== false;
  const fallbackEnabled = settings.fallbackEnabled !== false;
  if (!platformEnabled && !fallbackEnabled) {
    throw new Error("至少选择一个出书模式");
  }
  return { platformEnabled, fallbackEnabled };
}

function readModeSettingsFromFile(file = MODE_FILE) {
  try {
    return normalizeModeSettings(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    if (error.message.includes("至少选择一个")) throw error;
    return normalizeModeSettings({});
  }
}

function writeModeSettingsToFile(file = MODE_FILE, settings) {
  const normalized = normalizeModeSettings(settings);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function modeText(settings) {
  const mode = normalizeModeSettings(settings);
  if (mode.platformEnabled && mode.fallbackEnabled) return "平台+兜底";
  if (mode.platformEnabled) return "仅平台";
  return "仅兜底";
}

module.exports = {
  MODE_FILE,
  modeText,
  normalizeModeSettings,
  readModeSettingsFromFile,
  writeModeSettingsToFile,
};
