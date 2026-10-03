import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-security-test-"));

const embeds = await import("../src/modlog/embeds.js");
const { wasBotAction } = await import("../src/modlog/index.js");
const guard = await import("../src/security/guard.js");
const { onRoleDelete } = await import("../src/security/nukeaction.js");
const { runModAction } = await import("../src/modlog/actions.js");
const khoakhan = (await import("../src/commands/khoakhan.js")).default;
const { getSection } = await import("../src/settings.js");

let counter = 0;
const sf = () => `7${String(++counter).padStart(17, "0")}`;
const BOT = sf();
const perms = (granted) => ({ has: (flag) => granted === "all" || granted.some((name) => P[name] === flag) });

test("a role losing Administrator and gaining a permission shows both changes", () => {
  const { added, removed } = embeds.diffPermissions(P.Administrator, P.ManageGuild);
  assert.deepEqual(added, ["ManageGuild"]);
  assert.deepEqual(removed, ["Administrator"]);
  const both = embeds.diffPermissions(P.Administrator, P.Administrator | P.BanMembers);
  assert.deepEqual(both.added, ["BanMembers"]);
});

function modGuild() {
  const bans = [];
  const guild = {
    id: sf(),
    name: "S",
    ownerId: sf(),
    channels: { cache: new Collection() },
    members: { me: { id: BOT, permissions: perms("all"), roles: { highest: { position: 10 } } }, ban: async () => { throw new Error("Missing Permissions"); } },
    bans,
  };
  return guild;
}

function modInteraction({ guild, target, member, options = {}, order = [] }) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    user: { id: sf() },
    member: { permissions: perms("all"), roles: { highest: { position: 5 } } },
    options: { getUser: () => target, getMember: () => member, getString: (n) => options[n] ?? null, getInteger: (n) => options[n] ?? null },
    reply: async (p) => { order.push("reply"); replies.push(p); },
    deferReply: async () => { order.push("defer"); },
    editReply: async (p) => { order.push("edit"); replies.push(p); },
  };
}

test("a failed ban does not hide the next real ban of that person from the log", async () => {
  const guild = modGuild();
  const target = { id: sf(), send: async () => {} };
  const i = modInteraction({ guild, target, member: null, options: { lydo: "spam" } });
  await runModAction(i, "ban");
  assert.equal(wasBotAction(guild.id, target.id, "ban"), false);
});

test("a kick Discord would refuse sends no notice and changes nothing", async () => {
  const guild = modGuild();
  const dms = [];
  const target = { id: sf(), send: async (p) => dms.push(p) };
  let kicked = false;
  const member = { id: target.id, kickable: false, permissions: perms([]), roles: { highest: { position: 1 } }, kick: async () => (kicked = true) };
  const i = modInteraction({ guild, target, member, options: { lydo: "spam" } });
  await runModAction(i, "kick");
  assert.equal(dms.length, 0);
  assert.equal(kicked, false);
  assert.equal(i.replies.length, 1);
});

test("a slow moderation action answers Discord first and finishes through editReply", async () => {
  const guild = modGuild();
  const target = { id: sf(), send: async () => {} };
  const order = [];
  const member = { id: target.id, permissions: perms([]), roles: { highest: { position: 1 } }, kick: async () => order.push("kick") };
  const i = modInteraction({ guild, target, member, options: { lydo: "spam" }, order });
  await runModAction(i, "kick");
  assert.deepEqual(order, ["defer", "kick", "edit"]);
});

function lockChannel() {
  return {
    id: sf(),
    type: ChannelType.GuildText,
    manageable: true,
    permissionOverwrites: { cache: { get: () => undefined }, edit: async () => {} },
    permissionsFor: () => ({ has: () => true }),
  };
}

test("locking channels needs Manage Roles too, because Discord requires it to edit overwrites", async () => {
  const c = lockChannel();
  const cache = new Collection([[c.id, c]]);
  const guild = {
    id: sf(),
    ownerId: sf(),
    verificationLevel: 1,
    channels: { cache },
    roles: { everyone: { id: "x" } },
    members: { me: { id: BOT, permissions: perms(["ManageChannels"]), roles: { highest: { position: 10 } } } },
  };
  const result = await guard.startLockdown(guild);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "perms");
  assert.ok(result.missing.includes("Quản lý role"));
});

test("khoakhan bat and tat answer Discord first, since editing many channels takes long", async () => {
  const order = [];
  const c = lockChannel();
  const guild = {
    id: sf(),
    ownerId: sf(),
    verificationLevel: 1,
    channels: { cache: new Collection([[c.id, c]]) },
    roles: { everyone: { id: "x" } },
    members: { me: { id: BOT, permissions: perms("all"), roles: { highest: { position: 10 } } } },
  };
  const make = (sub) => ({
    guild,
    guildId: guild.id,
    member: { permissions: perms("all") },
    options: { getSubcommand: () => sub },
    reply: async () => order.push("reply"),
    deferReply: async () => order.push("defer"),
    editReply: async () => order.push("edit"),
  });
  await khoakhan.execute(make("bat"));
  await khoakhan.execute(make("tat"));
  assert.deepEqual(order, ["defer", "edit", "defer", "edit"]);
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
});

test("deleting an integration role with its bot is not counted as a purge", () => {
  const guild = { id: sf() };
  assert.equal(onRoleDelete({ id: sf(), guild, managed: true, client: { user: { id: BOT } } }), null);
});
