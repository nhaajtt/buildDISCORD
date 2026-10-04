import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";

const { sanitize } = await import("../src/suggest/logic.js");

test("sanitize: nested mention syntax cannot reassemble after one pass", () => {
  for (const evil of ["@eve@everyoneryone", "@he@hererere", "<<@123>@456>", "<@<@1>2>", "<#<#1>2>", "<@&<@&1>2>"]) {
    const out = sanitize(evil, 200);
    assert.doesNotMatch(out, /@(everyone|here)/i, evil);
    assert.doesNotMatch(out, /<[@#]/, evil);
  }
});
