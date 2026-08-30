const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  modeText,
  normalizeModeSettings,
  readModeSettingsFromFile,
  writeModeSettingsToFile,
} = require("../src/mode-settings");

function testNormalizeDefaultsToBothEnabled() {
  assert.deepStrictEqual(normalizeModeSettings({}), {
    platformEnabled: true,
    fallbackEnabled: true,
  });
}

function testNormalizeRequiresAtLeastOneEnabled() {
  assert.throws(
    () => normalizeModeSettings({ platformEnabled: false, fallbackEnabled: false }),
    /至少选择一个/
  );
}

function testModeText() {
  assert.strictEqual(modeText({ platformEnabled: true, fallbackEnabled: true }), "平台+兜底");
  assert.strictEqual(modeText({ platformEnabled: true, fallbackEnabled: false }), "仅平台");
  assert.strictEqual(modeText({ platformEnabled: false, fallbackEnabled: true }), "仅兜底");
}

function testReadWriteModeSettings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dz-mode-"));
  const file = path.join(dir, "mode.json");
  try {
    assert.deepStrictEqual(readModeSettingsFromFile(file), { platformEnabled: true, fallbackEnabled: true });
    writeModeSettingsToFile(file, { platformEnabled: false, fallbackEnabled: true });
    assert.deepStrictEqual(readModeSettingsFromFile(file), { platformEnabled: false, fallbackEnabled: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

testNormalizeDefaultsToBothEnabled();
testNormalizeRequiresAtLeastOneEnabled();
testModeText();
testReadWriteModeSettings();
console.log("mode-settings tests passed");
