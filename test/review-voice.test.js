import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-voice-"));

const rooms = await import("../src/tempvoice/rooms.js");
const store = await import("../src/tempvoice/store.js");
const stats = await import("../src/jobs/stats.js");
const kenh = (await import("../src/commands/kenhthongke.js")).default;
const { setSection, getSection } = await import("../src/settings.js");
const { loadRecord, saveRecord } = await import("../src/store.js");

let n = 0;
const sf = () => `96${String(++n).padStart(16, "0")}`;
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);

test("a burst of joins cannot push a server past the room cap", async () => {
  const guildId = sf();
  const voice = new Map();
  const channels = new Map();
  let made = 0;
  const lobby = { id: sf(), type: ChannelType.GuildVoice, parentId: null, members: { size: 0 } };
  channels.set(lobby.id, lobby);
  const guild = {
    id: guildId,
    name: "S",
    available: true,
    members: { me: { permissions: { has: () => true } } },
    voiceStates: { cache: voice },
    channels: {
      cache: channels,
      create: async (o) => {
        made += 1;
        await new Promise((r) => setTimeout(r, 20));
        const c = { id: sf(), type: ChannelType.GuildVoice, parentId: null, members: { size: 0 }, delete: async () => {}, ...o };
        channels.set(c.id, c);
        return c;
      },
    },
  };
  setSection(guildId, "tempvoice", { enabled: true, lobbyChannelIds: [lobby.id] });
  for (let i = 0; i < 49; i++) store.recordRoom({ channelId: sf(), guildId, ownerId: "u", now: T0 });
  const person = () => {
    const id = sf();
    voice.set(id, { id, channelId: lobby.id });
    return { id, displayName: "x", user: { bot: false }, send: async () => {}, voice: { setChannel: async () => {} }, guild };
  };
  const members = [person(), person(), person()];
  await Promise.all(members.map((m) => rooms.handleVoiceUpdate({ channelId: null, guild, member: m }, { channelId: lobby.id, guild, member: m }, { now: T0 })));
  assert.equal(made, 1, "only the one free slot is built");
  assert.equal(store.countRooms(guildId), 50);
});

function statsWorld({ perms = true } = {}) {
  const guildId = sf();
  const created = [];
  const guild = {
    id: guildId,
    memberCount: 5,
    roles: { cache: new Map() },
    members: { me: { permissions: { has: (f) => perms === true || perms.includes(f) } } },
    channels: {
      cache: new Map(),
      create: async (o) => {
        const c = { id: sf(), type: ChannelType.GuildVoice, isVoiceBased: () => true, permissionsFor: () => ({ has: () => true }), setName: async () => {}, delete: async () => {}, ...o };
        guild.channels.cache.set(c.id, c);
        created.push(c);
        return c;
      },
    },
  };
  guild.channels.cache.set(guildId, { id: guildId });
  const replies = [];
  const run = (options) =>
    kenh.execute({
      guild,
      guildId,
      member: { permissions: { has: () => true } },
      options: { getSubcommand: () => "them", getString: (k) => options[k] ?? null, getChannel: (k) => options[k] ?? null, getBoolean: (k) => options[k] ?? null },
      reply: async (r) => replies.push(r.content),
    });
  return { guildId, guild, created, replies, run };
}

test("removing a picked stats channel leaves the setup record's own channel list alone", async () => {
  const w = statsWorld();
  const mine = sf();
  saveRecord(w.guildId, { ...loadRecord(w.guildId), channels: [mine] });
  const picked = { id: mine, type: ChannelType.GuildVoice, isVoiceBased: () => true, permissionsFor: () => ({ has: () => true }), setName: async () => {}, name: "x" };
  w.guild.channels.cache.set(mine, picked);
  await w.run({ loai: "members", kenh: picked });
  assert.equal(getSection(w.guildId, "stats").channels.length, 1);
  const xoa = {
    guild: w.guild,
    guildId: w.guildId,
    member: { permissions: { has: () => true } },
    options: { getSubcommand: () => "xoa", getString: () => mine },
    reply: async () => {},
  };
  await kenh.execute(xoa);
  assert.deepEqual(loadRecord(w.guildId).channels, [mine], "/nuke still knows about it");
});

test("a built stats channel needs the rights to lock it before anything is created", async () => {
  const w = statsWorld({ perms: [P.ManageChannels] });
  await w.run({ loai: "members", tao: true });
  assert.equal(w.created.length, 0);
  assert.match(w.replies[0], /Quản lý role/);
});

test("two stats channels built at once both end up on the list", async () => {
  const w = statsWorld();
  const slow = w.guild.channels.create;
  w.guild.channels.create = async (o) => {
    await new Promise((r) => setTimeout(r, 10));
    return slow(o);
  };
  setSection(w.guildId, "stats", { enabled: true, channels: [] });
  const { grant } = await import("../src/license.js");
  grant(w.guildId, "pro", 30, Date.now());
  await Promise.all([w.run({ loai: "members", tao: true }), w.run({ loai: "boosts", tao: true })]);
  assert.equal(getSection(w.guildId, "stats").channels.length, 2);
});

test("a rename stuck behind Discord's rate limit does not hold the round", async () => {
  const guildId = sf();
  const channel = { id: sf(), name: "old", isVoiceBased: () => true, permissionsFor: () => ({ has: () => true }), setName: () => new Promise(() => {}) };
  const guild = {
    id: guildId,
    memberCount: 9,
    roles: { cache: new Map() },
    members: { me: {} },
    channels: { cache: new Map([[channel.id, channel]]) },
  };
  setSection(guildId, "stats", { enabled: true, channels: [{ channelId: channel.id, kind: "members", template: "M: {n}" }] });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const done = stats.updateGuildStats(guild, { now: T0 });
    await Promise.resolve();
    mock.timers.tick(stats.RENAME_WAIT_MS + 1);
    const result = await done;
    assert.deepEqual(result.renamed, []);
  } finally {
    mock.timers.reset();
  }
});
