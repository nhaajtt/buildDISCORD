import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "credit-test-"));

const { buildWelcomePost, CREDIT_LINE } = await import("../src/onboarding/format.js");

test("the free plan welcome carries the credit line, paid plans do not", () => {
  const settings = { message: "Chào {user}", verifyEnabled: false, verifyRoleId: null };
  assert.ok(buildWelcomePost(settings, { userId: "42", serverName: "x", credit: true }).content.endsWith(CREDIT_LINE));
  assert.ok(!buildWelcomePost(settings, { userId: "42", serverName: "x" }).content.includes(CREDIT_LINE));
});
