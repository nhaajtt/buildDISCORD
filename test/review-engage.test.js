import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Collection } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-engage-"));

const { handlePress, createMenu, getMenu } = await import("../src/activity/rolemenus.js");
const guildDelete = (await import("../src/events/guildDelete.js")).default;

const GUILD = "800000000000000001";
const ROLE_A = "800000000000000011";
const ROLE_B = "800000000000000012";

function pressFixture({ failAdd = false } = {}) {
  const calls = [];
  const role = (id, name, position) => ({ id, name, position, managed: false, permissions: { bitfield: 0n } });
  const roles = new Collection([[ROLE_A, role(ROLE_A, "A", 1)], [ROLE_B, role(ROLE_B, "B", 2)]]);
  const held = new Collection([[ROLE_A, roles.get(ROLE_A)]]);
  const replies = [];
  const interaction = {
    guildId: GUILD,
    values: [ROLE_B],
    guild: { id: GUILD, roles: { cache: roles }, members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } } } },
    member: {
      roles: {
        cache: held,
        add: async (id) => {
          calls.push(["add", id]);
          if (failAdd) throw new Error("Missing Permissions");
        },
        remove: async (id) => calls.push(["remove", id]),
      },
    },
    reply: async (p) => replies.push(p),
  };
  return { interaction, calls, replies };
}

test("in a pick-one menu a role that cannot be given does not strip the role the person has", async () => {
  const id = createMenu(GUILD, "800000000000000099", "Menu", "single", [{ id: ROLE_A, emoji: "" }, { id: ROLE_B, emoji: "" }]);
  assert.ok(getMenu(id));

  const bad = pressFixture({ failAdd: true });
  await handlePress(bad.interaction, ["s", String(id)]);
  assert.deepEqual(bad.calls, [["add", ROLE_B]], "nothing is removed when the new role failed");

  const good = pressFixture();
  await handlePress(good.interaction, ["s", String(id)]);
  assert.deepEqual(good.calls, [["add", ROLE_B], ["remove", ROLE_A]]);
});

test("a server removing the bot clears what was kept about it without throwing", () => {
  assert.doesNotThrow(() => guildDelete.execute({}, { id: GUILD, available: true }));
  assert.doesNotThrow(() => guildDelete.execute({}, { id: GUILD, available: false }));
});
