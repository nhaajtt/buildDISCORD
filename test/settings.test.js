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

test("servers listed as unlocked get every feature without a license, and nothing else does", async () => {
  // config is read once at start, so the list is set in a fresh process
  const { spawnSync } = await import("node:child_process");
  const script = `
    const { getPlan, revoke, isUnlocked } = await import("./src/license.js");
    const { gateFeature, gateLimit } = await import("./src/utils/gate.js");
    const plan = getPlan("111111111111111111");
    const other = getPlan("222222222222222222");
    revoke("111111111111111111");
    console.log(JSON.stringify({
      plan: plan.plan, unlocked: plan.unlocked, expires: plan.expiresAt, tickets: gateFeature("111111111111111111", "tickets"),
      games: gateFeature("111111111111111111", "games"), humor: gateFeature("111111111111111111", "humor"),
      backups: gateLimit("111111111111111111", "backups", 49, "bản sao lưu"), manyBackups: gateLimit("111111111111111111", "backups", 50, "bản sao lưu"),
      afterRevoke: getPlan("111111111111111111").plan, otherPlan: other.plan, otherUnlocked: Boolean(other.unlocked), isUnlocked: isUnlocked("111111111111111111"),
    }));`;
  const dir = mkdtempSync(path.join(tmpdir(), "unlock-test-"));
  const run = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script], {
    cwd: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), ".."),
    env: { ...process.env, DISCORD_TOKEN: "x", CLIENT_ID: "1", DATA_DIR: dir, UNLOCKED_GUILD_IDS: "111111111111111111, 333333333333333333" },
    encoding: "utf8",
  });
  const out = JSON.parse(run.stdout.trim().split("\n").pop());
  assert.equal(out.plan, "plus");
  assert.equal(out.unlocked, true);
  assert.equal(out.expires, null);
  assert.equal(out.tickets, null);
  assert.equal(out.games, null);
  assert.equal(out.humor, null);
  assert.equal(out.backups, null, "49 of 50 is still allowed");
  assert.match(out.manyBackups, /50/, "the limit exists but is far above a paid plan");
  assert.equal(out.afterRevoke, "plus", "revoking a license cannot take the unlock away");
  assert.equal(out.otherPlan, "free");
  assert.equal(out.otherUnlocked, false);
  assert.equal(out.isUnlocked, true);
});
