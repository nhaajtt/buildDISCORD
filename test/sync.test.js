import { test } from "node:test";
import assert from "node:assert/strict";

test("the dashboard hooks for stats channels and temp voice exist", async () => {
  process.env.DISCORD_TOKEN = "x";
  process.env.CLIENT_ID = "1";
  const stats = await import("../src/stats/index.js");
  const voice = await import("../src/tempvoice/index.js");
  assert.equal(typeof stats.syncStats, "function");
  assert.deepEqual(await voice.syncTempVoice(), { ok: true });
});
