import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "cmd-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";

const build = (await import("../src/commands/build.js")).default;
const { grant } = await import("../src/license.js");

// The smallest fake of a slash command interaction that /build touches
function fakeInteraction({ guildId, options = {}, admin = true }) {
  const replies = [];
  const has = () => true;
  return {
    replies,
    guildId,
    user: { id: "u1" },
    member: { permissions: { has: (flag) => admin && (flag === PermissionFlagsBits.Administrator || has()) } },
    guild: { members: { me: { permissions: { has } } } },
    options: { getString: (name) => options[name] ?? null },
    reply: async (payload) => replies.push(payload),
    editReply: async (payload) => replies.push(payload),
  };
}

test("/build opens the editor for a free server with one theme", async () => {
  const i = fakeInteraction({ guildId: "free-1", options: { theme: "gaming" } });
  await build.execute(i);
  assert.equal(i.replies.length, 1);
  assert.ok(i.replies[0].embeds?.length, "an editor embed is shown");
  assert.match(i.replies[0].embeds[0].data.footer.text, /danh mục/);
});

test("/build refuses a free server that asks for mixing, and another humor level", async () => {
  const mix = fakeInteraction({ guildId: "free-2", options: { theme: "gaming", theme2: "anime" } });
  await build.execute(mix);
  assert.match(mix.replies[0].content, /Pro/);

  const humor = fakeInteraction({ guildId: "free-3", options: { theme: "gaming", "muc-do-hai": "nham" } });
  await build.execute(humor);
  assert.match(humor.replies[0].content, /mức hài/i);
});

test("/build lets a Pro server mix themes and pick a humor level", async () => {
  grant("pro-1", "pro", 30);
  const i = fakeInteraction({ guildId: "pro-1", options: { theme: "booking", theme2: "anime", "muc-do-hai": "nhe" } });
  await build.execute(i);
  assert.ok(i.replies[0].embeds?.length);
  assert.match(i.replies[0].embeds[0].data.description, /Nhẹ nhàng/);
});

test("/build refuses someone who is not an administrator", async () => {
  const i = fakeInteraction({ guildId: "free-4", options: { theme: "gaming" }, admin: false });
  await build.execute(i);
  assert.equal(i.replies[0].embeds, undefined);
  assert.ok(i.replies[0].content);
});
