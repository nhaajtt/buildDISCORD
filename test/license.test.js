import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const dataDir = mkdtempSync(path.join(tmpdir(), "license-test-"));
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = dataDir;
// A first-version JSON record that must be imported into SQLite on first open
writeFileSync(path.join(dataDir, "777.json"), JSON.stringify({ theme: "gaming", roles: ["r1"], pickRoles: [], categories: [], channels: ["c1"] }));

const { startTrial, createLicense, getPlan, redeem, revoke, grant, getUsage, addUsage, normalizeCode } = await import("../src/license.js");
const { gateBuild, recordBuild } = await import("../src/utils/gate.js");
const { loadRecord } = await import("../src/store.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 10);

test("old JSON records are migrated into the database", () => {
  assert.deepEqual(loadRecord("777").channels, ["c1"]);
  assert.ok(readdirSync(dataDir).includes("777.json.migrated"));
});

test("a server without a license is on the free plan", () => {
  assert.equal(getPlan("g-free", NOW).plan, "free");
});

test("a code activates once and expires on time", () => {
  const code = createLicense("pro", 30, NOW);
  assert.match(code, /^THAU-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const result = redeem(code.toLowerCase(), "g1", NOW);
  assert.equal(result.ok, true);
  assert.equal(result.expiresAt, NOW + 30 * DAY);
  assert.equal(getPlan("g1", NOW + 29 * DAY).plan, "pro");
  assert.equal(getPlan("g1", NOW + 31 * DAY).plan, "free");
});

test("a code cannot be reused by another server or twice by the same one", () => {
  const code = createLicense("pro", 7, NOW);
  assert.equal(redeem(code, "g2", NOW).ok, true);
  assert.deepEqual(redeem(code, "g3", NOW), { ok: false, reason: "used" });
  assert.deepEqual(redeem(code, "g2", NOW), { ok: false, reason: "mine" });
  assert.deepEqual(redeem("THAU-NOPE-NOPE-NOPE", "g2", NOW), { ok: false, reason: "unknown" });
});

test("a second code of the same plan extends the expiry", () => {
  redeem(createLicense("pro", 10, NOW), "g4", NOW);
  const second = redeem(createLicense("pro", 10, NOW), "g4", NOW + 2 * DAY);
  assert.equal(second.expiresAt, NOW + 20 * DAY);
});

test("the higher plan wins while both are active", () => {
  redeem(createLicense("pro", 30, NOW), "g5", NOW);
  redeem(createLicense("plus", 5, NOW), "g5", NOW);
  assert.equal(getPlan("g5", NOW + 1 * DAY).plan, "plus");
  assert.equal(getPlan("g5", NOW + 6 * DAY).plan, "pro");
});

test("revoke ends the paid plan immediately", () => {
  grant("g6", "plus", 30, NOW);
  assert.equal(getPlan("g6", NOW + 1).plan, "plus");
  assert.equal(revoke("g6", NOW + 2), 1);
  assert.equal(getPlan("g6", NOW + 3).plan, "free");
});

test("invalid plans and day counts are refused", () => {
  assert.throws(() => createLicense("free", 30));
  assert.throws(() => createLicense("pro", 0));
  assert.throws(() => createLicense("pro", 1.5));
  assert.equal(normalizeCode("  thau-abcd-efgh-jklm "), "THAU-ABCD-EFGH-JKLM");
});

test("usage counts per month and for a lifetime", () => {
  addUsage("g7", "ai", { now: NOW });
  addUsage("g7", "ai", { now: NOW });
  assert.equal(getUsage("g7", "ai", { now: NOW }), 2);
  assert.equal(getUsage("g7", "ai", { now: NOW + 40 * DAY }), 0);
  addUsage("g7", "build", { lifetime: true });
  assert.equal(getUsage("g7", "build", { lifetime: true }), 1);
});

test("free servers get two single-theme builds, paid servers mix and rebuild", () => {
  assert.match(gateBuild("g8", 2), /Pro/);
  assert.equal(gateBuild("g8", 1), null);
  recordBuild("g8");
  assert.equal(gateBuild("g8", 1), null, "a second build is allowed so a wrong theme can be redone");
  recordBuild("g8");
  assert.match(gateBuild("g8", 1), /2 lần/);

  grant("g8", "pro", 30);
  assert.equal(gateBuild("g8", 3), null);
});

test("every command loads, has a unique name and valid Discord JSON", async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "commands");
  const names = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const { default: command } = await import(pathToFileURL(path.join(dir, file)).href);
    const json = command.data.toJSON();
    assert.ok(!names.has(json.name), `duplicate command ${json.name}`);
    names.add(json.name);
    assert.equal(typeof command.execute, "function", file);
  }
  for (const name of ["build", "nuke", "kichhoat", "goi", "admin", "xoadulieu"]) assert.ok(names.has(name), name);
});

test("database backup writes one copy per day and keeps the last seven", async () => {
  const { backupDb } = await import("../src/backup.js");
  const first = backupDb(new Date("2026-02-01T10:00:00Z"));
  assert.ok(first && first.endsWith("thauxaydung-2026-02-01.db"));
  assert.equal(backupDb(new Date("2026-02-01T20:00:00Z")), null);
  for (let day = 2; day <= 10; day++) backupDb(new Date(`2026-02-${String(day).padStart(2, "0")}T10:00:00Z`));
  const kept = readdirSync(path.join(dataDir, "backups")).sort();
  assert.equal(kept.length, 7);
  assert.equal(kept[0], "thauxaydung-2026-02-04.db");
});

test("a trial gives one week of Pro, once per server", () => {
  const first = startTrial("trial-1", NOW);
  assert.equal(first.ok, true);
  assert.equal(first.plan, "pro");
  assert.equal(first.expiresAt, NOW + 7 * DAY);
  assert.equal(getPlan("trial-1", NOW + DAY).plan, "pro");
  assert.equal(getPlan("trial-1", NOW + 8 * DAY).plan, "free");
  assert.deepEqual(startTrial("trial-1", NOW + 9 * DAY), { ok: false, reason: "used" });
});

test("a server that already pays does not start a trial and keeps its chance", () => {
  grant("trial-2", "plus", 30, NOW);
  assert.deepEqual(startTrial("trial-2", NOW), { ok: false, reason: "paid" });
  assert.equal(getUsage("trial-2", "trial", { lifetime: true }), 0);
});
