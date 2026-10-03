import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "settings-test-"));

const { SECTIONS, SECTION_NAMES, getSection, setSection, patchSection, clearSettings } = await import("../src/settings.js");
const { getPlan, grant } = await import("../src/license.js");
const { gateFeature } = await import("../src/utils/gate.js");

const ID = "123456789012345678";

test("a server with nothing saved gets the defaults of every section", () => {
  for (const name of SECTION_NAMES) assert.deepEqual(getSection("g-new", name), SECTIONS[name].normalize({}), name);
  assert.equal(getSection("g-new", "welcome").enabled, false);
  assert.equal(getSection("g-new", "tickets").types[0].key, "ho-tro");
});

test("values are rebuilt field by field: wrong types, bad ids and oversize text are dropped or clamped", () => {
  const w = setSection("g1", "welcome", { enabled: "yes", channelId: "not-an-id", message: "x".repeat(900), verifyRoleId: ID, extra: "ignored" });
  assert.equal(w.enabled, false);
  assert.equal(w.channelId, null);
  assert.equal(w.message.length, 500);
  assert.equal(w.verifyRoleId, ID);
  assert.equal("extra" in w, false);

  const a = setSection("g1", "automod", { level: "extreme", mentionLimit: 999, exemptRoleIds: [ID, ID, "bad", 5], ruleIds: { spam: ID, "Bad Key": ID, other: "nope" } });
  assert.equal(a.level, "vua");
  assert.equal(a.mentionLimit, 20);
  assert.deepEqual(a.exemptRoleIds, [ID]);
  assert.deepEqual(a.ruleIds, { spam: ID });

  const t = setSection("g1", "tickets", { types: [{ key: "Báo Cáo!", label: "Báo cáo", emoji: "🚩" }, { key: "baocao", label: "Trùng", emoji: "" }, { key: "", label: "x" }], maxOpenPerUser: 0, autoCloseHours: -4 });
  assert.deepEqual(t.types.map((x) => x.key), ["boco", "baocao"]);
  assert.equal(t.maxOpenPerUser, 1);
  assert.equal(t.autoCloseHours, 0);
});

test("a section is stored and read back, patches change only the given fields, and sections are independent", () => {
  setSection("g2", "welcome", { enabled: true, channelId: ID });
  patchSection("g2", "welcome", { message: "Chào {user}" });
  assert.deepEqual(getSection("g2", "welcome"), { enabled: true, channelId: ID, message: "Chào {user}", verifyEnabled: false, verifyRoleId: null, newbieRoleId: null });
  assert.equal(getSection("g2", "automod").enabled, false);
  clearSettings("g2");
  assert.equal(getSection("g2", "welcome").enabled, false);
});

test("an unknown section is refused", () => {
  assert.throws(() => getSection("g3", "nope"), /Unknown settings section/);
  assert.throws(() => setSection("g3", "nope", {}), /Unknown settings section/);
});

test("the admin tools are on the plans: onboarding and the audit are free, tickets and full AutoMod are Pro", () => {
  assert.equal(getPlan("g-free").onboarding, true);
  assert.equal(getPlan("g-free").audit, true);
  assert.match(gateFeature("g-free", "tickets"), /Pro/);
  assert.match(gateFeature("g-free", "automodFull"), /Pro/);
  grant("g-paid", "pro", 30);
  assert.equal(gateFeature("g-paid", "tickets"), null);
  assert.equal(gateFeature("g-paid", "automodFull"), null);
});
