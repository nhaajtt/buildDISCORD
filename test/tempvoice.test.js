import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "tempvoice-test-"));

const rules = await import("../src/tempvoice/rules.js");
const store = await import("../src/tempvoice/store.js");
const rooms = await import("../src/tempvoice/rooms.js");
const { getSection, setSection, patchSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");

const { roomName, createCooldown, ownerOverwrite, activeLobbies, OWNER_ALLOW, ROOM_CAP, COOLDOWN_MS } = rules;

let n = 0;
const sf = () => `94${String(++n).padStart(16, "0")}`;
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);

// ---------------------------------------------------------------- pure rules

test("room names: {name} filled everywhere, cleaned, capped at 100, never empty", () => {
  assert.equal(roomName("Phòng của {name}", "Mai"), "Phòng của Mai");
  assert.equal(roomName("{name} và {name}", "An"), "An và An");
  assert.equal(roomName("{name}", "a‮b\u0007c\nd"), "abc d");
  assert.equal(roomName("Room {name}", "@everyone #x: `y`"), "Room everyone x y");
  assert.equal(roomName("{name}".repeat(60), "n".repeat(60)).length, 100);
  assert.equal(roomName("x".repeat(500), "n").length, 100);
  assert.equal(roomName("", "Mai"), "Phòng tạm");
  assert.equal(roomName("​ ‮", "Mai"), "Phòng tạm");
  assert.equal(roomName("Phòng {name}", ""), "Phòng bạn");
  assert.equal(roomName("Phòng {name}", null), "Phòng bạn");
  assert.equal(roomName(undefined, "Mai"), "Phòng tạm");
});

test("the owner's overwrite is exactly view, connect, rename and move, on that channel", () => {
  const o = ownerOverwrite("123");
  assert.equal(o.id, "123");
  assert.deepEqual(o.allow, [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers]);
  assert.equal(o.deny, undefined);
  assert.equal(OWNER_ALLOW.length, 4);
  for (const bad of [P.Administrator, P.ManageRoles, P.ManageGuild, P.KickMembers, P.BanMembers, P.ManageMessages, P.MentionEveryone, P.MuteMembers, P.DeafenMembers]) {
    assert.ok(!o.allow.includes(bad));
  }
  o.allow.push(P.Administrator);
  assert.equal(ownerOverwrite("123").allow.length, 4, "each call gets its own list");
});

test("cooldown: ten seconds per key, independent keys, bounded memory", () => {
  const c = createCooldown();
  assert.equal(COOLDOWN_MS, 10_000);
  assert.equal(c.take("a", T0), true);
  assert.equal(c.take("a", T0 + 1), false);
  assert.equal(c.take("a", T0 + 9_999), false);
  assert.equal(c.take("b", T0 + 5), true, "another person is not held back");
  assert.equal(c.take("a", T0 + 10_000), true);
  assert.equal(c.take("a", T0 + 10_001), false, "taking restarts the clock");

  const small = createCooldown({ ms: 10_000, keep: 50 });
  for (let i = 0; i < 5000; i++) small.take(`k${i}`, T0 + i);
  assert.ok(small.size() <= 50, `size ${small.size()}`);
  const wide = createCooldown({ ms: 10_000, keep: 50 });
  for (let i = 0; i < 100; i++) wide.take(`k${i}`, T0 + i * 1000);
  assert.ok(wide.size() <= 50);
});

test("lobbies the plan covers keep the order they were added in", () => {
  assert.deepEqual(activeLobbies(["a", "b", "c"], 2), ["a", "b"]);
  assert.deepEqual(activeLobbies(["a"], 0), []);
  assert.deepEqual(activeLobbies(["a", "b"], 5), ["a", "b"]);
  assert.equal(ROOM_CAP, 50);
});

test("settings: at most 5 lobbies, clean ids, template and limit bounded", () => {
  const ids = Array.from({ length: 9 }, sf);
  const s = setSection("g-set", "tempvoice", { enabled: true, lobbyChannelIds: [...ids, ids[0], "abc", 5], categoryId: "nope", nameTemplate: "x".repeat(200), userLimit: 500 });
  assert.equal(s.lobbyChannelIds.length, 5);
  assert.equal(new Set(s.lobbyChannelIds).size, 5);
  assert.equal(s.categoryId, null);
  assert.equal(s.nameTemplate.length, 60);
  assert.equal(s.userLimit, 99);
  assert.equal(setSection("g-set", "tempvoice", { nameTemplate: "   " }).nameTemplate, "Phòng của {name}");
  assert.equal(getSection("g-none", "tempvoice").enabled, false);
});

// ---------------------------------------------------------------- the table

test("rooms are recorded, found, counted per server and forgotten", () => {
  store.recordRoom({ channelId: "c1", guildId: "gA", ownerId: "u1", now: 5 });
  store.recordRoom({ channelId: "c2", guildId: "gA", ownerId: "u2", now: 6 });
  store.recordRoom({ channelId: "c3", guildId: "gB", ownerId: "u3", now: 7 });
  assert.equal(store.countRooms("gA"), 2);
  assert.equal(store.countRooms("gB"), 1);
  assert.equal(store.getRoom("c2").owner_id, "u2");
  assert.equal(store.getRoom("zzz"), null);
  store.recordRoom({ channelId: "c2", guildId: "gA", ownerId: "u9", now: 8 });
  assert.equal(store.countRooms("gA"), 2, "recording twice does not duplicate");
  assert.equal(store.forgetRoom("c1"), 1);
  assert.equal(store.forgetRoom("c1"), 0);
  assert.deepEqual(store.allRooms().map((r) => r.channel_id).sort(), ["c2", "c3"]);
  store.forgetRoom("c2");
  store.forgetRoom("c3");
});

// ---------------------------------------------------------------- the Discord layer with plain fakes

function world({ perms = true, pro = false } = {}) {
  const guildId = sf();
  if (pro) grant(guildId, "pro", 30, T0);
  const channels = new Map();
  const deleted = [];
  const sent = [];
  const voice = new Map();
  const add = (o) => {
    const c = {
      id: sf(),
      type: ChannelType.GuildVoice,
      parentId: null,
      permissionOverwrites: { cache: new Map() },
      isVoiceBased: () => true,
      members: { size: 0 },
      guildId,
      ...o,
    };
    c.delete = async () => {
      deleted.push(c.id);
      if (!channels.delete(c.id)) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
    };
    channels.set(c.id, c);
    return c;
  };
  const guild = {
    id: guildId,
    name: "Server",
    available: true,
    members: { me: { permissions: { has: (f) => perms === true || perms.includes(f) } } },
    voiceStates: { cache: voice },
    channels: {
      cache: channels,
      fetch: async (id) => channels.get(id) ?? Promise.reject(Object.assign(new Error("Unknown Channel"), { code: 10003 })),
      create: async (o) => {
        const c = add({ ...o, parentId: o.parent ?? null });
        guild.createdWith.push(o);
        return c;
      },
    },
    createdWith: [],
  };
  const lobby = add({ name: "lobby" });
  const person = (name = "Mai", { bot = false } = {}) => {
    const id = sf();
    return {
      id,
      displayName: name,
      user: { bot },
      send: async (text) => sent.push({ to: id, text }),
      voice: {
        setChannel: async (channel) => {
          voice.set(id, { id, channelId: channel.id });
          channel.members = { size: (channel.members?.size ?? 0) + 1 };
        },
      },
      guild,
    };
  };
  const join = (member, channel) => {
    voice.set(member.id, { id: member.id, channelId: channel.id });
    channel.members = { size: (channel.members?.size ?? 0) + 1 };
    return rooms.handleVoiceUpdate({ channelId: null, guild, member }, { channelId: channel.id, guild, member }, { now: T0 });
  };
  return { guild, channels, lobby, person, join, add, deleted, sent, client: { guilds: { cache: new Map([[guildId, guild]]) } } };
}

const on = (w, patch = {}) => setSection(w.guild.id, "tempvoice", { enabled: true, lobbyChannelIds: [w.lobby.id], ...patch });

test("a join to a lobby makes one recorded room named from the template", async () => {
  const w = world();
  on(w, { nameTemplate: "Phòng {name}", userLimit: 4 });
  const mai = w.person("Mai");
  const result = await w.join(mai, w.lobby);
  assert.equal(result.ok, true);
  const made = w.guild.createdWith[0];
  assert.equal(made.name, "Phòng Mai");
  assert.equal(made.type, ChannelType.GuildVoice);
  assert.equal(made.userLimit, 4);
  assert.deepEqual(made.permissionOverwrites, [ownerOverwrite(mai.id)]);
  assert.equal(store.getRoom(result.channelId).owner_id, mai.id);
  assert.equal(store.countRooms(w.guild.id), 1);
});

test("joining something that is not a lobby, while disabled, or as a bot, makes nothing", async () => {
  const w = world();
  const other = w.add({ name: "other" });
  on(w);
  assert.equal((await w.join(w.person(), other)).action, "none");
  assert.equal((await w.join(w.person("robot", { bot: true }), w.lobby)).action, "none");
  patchSection(w.guild.id, "tempvoice", { enabled: false });
  assert.equal((await w.join(w.person(), w.lobby)).action, "none");
  assert.equal(w.guild.createdWith.length, 0);
  // an update that does not change the channel (mute, deafen) is not a join
  patchSection(w.guild.id, "tempvoice", { enabled: true });
  const m = w.person();
  const res = await rooms.handleVoiceUpdate({ channelId: w.lobby.id, guild: w.guild, member: m }, { channelId: w.lobby.id, guild: w.guild, member: m });
  assert.equal(res.action, "none");
});

test("category: the chosen one is used, a missing one falls back to the lobby's own, and a full one is refused", async () => {
  const w = world();
  const home = w.add({ name: "nhà", type: ChannelType.GuildCategory });
  const chosen = w.add({ name: "chọn", type: ChannelType.GuildCategory });
  w.lobby.parentId = home.id;
  on(w, { categoryId: chosen.id });
  const a = w.person("A");
  await w.join(a, w.lobby);
  assert.equal(w.guild.createdWith[0].parent, chosen.id);
  w.channels.delete(chosen.id);
  const b = w.person("B");
  await w.join(b, w.lobby);
  assert.equal(w.guild.createdWith[1].parent, home.id);
  for (let i = 0; i < 50; i++) w.add({ name: `k${i}`, type: ChannelType.GuildText, parentId: home.id });
  const c = w.person("C");
  const res = await w.join(c, w.lobby);
  assert.equal(res.reason, "full");
  assert.match(w.sent.at(-1).text, /đầy/);
  assert.equal(w.guild.createdWith.length, 2);
});

test("a category's own overwrites are copied and the owner's entry is added on top", async () => {
  const w = world();
  const cat = w.add({ name: "kín", type: ChannelType.GuildCategory });
  cat.permissionOverwrites.cache.set("role1", { id: "role1", type: 0, allow: 0n, deny: P.ViewChannel });
  w.lobby.parentId = cat.id;
  on(w);
  const mai = w.person("Mai");
  await w.join(mai, w.lobby);
  const list = w.guild.createdWith[0].permissionOverwrites;
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: "role1", type: 0, allow: 0n, deny: P.ViewChannel });
  assert.deepEqual(list[1], ownerOverwrite(mai.id));
});

test("missing permissions are named and nothing is created", async () => {
  const w = world({ perms: [P.ViewChannel, P.Connect] });
  on(w);
  const res = await w.join(w.person("Lan"), w.lobby);
  assert.equal(res.reason, "perms");
  assert.deepEqual(res.missing, ["Quản lý kênh", "Di chuyển thành viên", "Quản lý role"]);
  assert.match(w.sent[0].text, /Quản lý kênh/);
  assert.equal(w.guild.createdWith.length, 0);
});

test("a failing create is reported and leaves no row; a failing move removes the room", async () => {
  const w = world();
  on(w);
  w.guild.channels.create = async () => {
    throw new Error("boom");
  };
  const res = await w.join(w.person("A"), w.lobby);
  assert.equal(res.reason, "create");
  assert.equal(store.countRooms(w.guild.id), 0);

  const v = world();
  on(v);
  const who = v.person("B");
  who.voice.setChannel = async () => {
    throw Object.assign(new Error("Target user is not connected to voice"), { code: 40032 });
  };
  const moved = await v.join(who, v.lobby);
  assert.equal(moved.reason, "left");
  assert.equal(store.countRooms(v.guild.id), 0);
  assert.equal(v.deleted.length, 1, "the room that was made is deleted again");
  assert.equal(v.sent.length, 0, "leaving is not an error worth a message");
});

test("the cooldown holds a second room back", async () => {
  const w = world();
  on(w);
  const m = w.person("A");
  assert.equal((await w.join(m, w.lobby)).ok, true);
  assert.equal((await w.join(m, w.lobby)).action, "cooldown");
  assert.equal(w.guild.createdWith.length, 1);
});

test("the cap of rooms per server", async () => {
  const w = world();
  on(w);
  for (let i = 0; i < ROOM_CAP; i++) store.recordRoom({ channelId: `cap${w.guild.id}${i}`, guildId: w.guild.id, ownerId: "1", now: T0 });
  const res = await w.join(w.person("Z"), w.lobby);
  assert.equal(res.reason, "cap");
  assert.match(w.sent[0].text, new RegExp(String(ROOM_CAP)));
  assert.equal(w.guild.createdWith.length, 0);
});

test("a lobby beyond the plan does nothing; Pro covers three", async () => {
  const free = world();
  const second = free.add({ name: "second" });
  setSection(free.guild.id, "tempvoice", { enabled: true, lobbyChannelIds: [free.lobby.id, second.id] });
  assert.equal((await free.join(free.person("A"), second)).action, "none");
  assert.equal((await free.join(free.person("B"), free.lobby)).ok, true);
  const pro = world({ pro: true });
  const extra = [pro.add({ name: "e1" }), pro.add({ name: "e2" }), pro.add({ name: "e3" })];
  setSection(pro.guild.id, "tempvoice", { enabled: true, lobbyChannelIds: [pro.lobby.id, ...extra.map((c) => c.id)] });
  assert.equal((await pro.join(pro.person("C"), extra[1])).ok, true);
  assert.equal((await pro.join(pro.person("D"), extra[2])).action, "none", "the fourth lobby is over the limit of three");
});

test("a room is deleted when it is empty, only if it is recorded", async () => {
  const w = world();
  on(w);
  const res = await w.join(w.person("A"), w.lobby);
  const room = w.channels.get(res.channelId);
  room.members = { size: 1 };
  assert.equal(await rooms.removeIfEmpty(w.guild, room.id), false, "someone is inside");
  room.members = { size: 0 };
  assert.equal(await rooms.removeIfEmpty(w.guild, room.id), true);
  assert.equal(store.getRoom(room.id), null);
  assert.deepEqual(w.deleted, [room.id]);
  // an unrecorded empty channel and a recorded row of another server are untouched
  const free = w.add({ name: "free" });
  assert.equal(await rooms.removeIfEmpty(w.guild, free.id), false);
  store.recordRoom({ channelId: free.id, guildId: "other-guild", ownerId: "1", now: T0 });
  assert.equal(await rooms.removeIfEmpty(w.guild, free.id), false);
  assert.ok(w.channels.has(free.id));
  store.forgetRoom(free.id);
});

test("a delete that fails keeps the row for the sweep, and an already-gone channel is simply forgotten", async () => {
  const w = world();
  const stuck = w.add({ name: "stuck" });
  store.recordRoom({ channelId: stuck.id, guildId: w.guild.id, ownerId: "1", now: T0 - 3_600_000 });
  stuck.delete = async () => {
    throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
  };
  assert.equal(await rooms.removeIfEmpty(w.guild, stuck.id), false);
  assert.ok(store.getRoom(stuck.id), "kept to try again");
  stuck.delete = async () => {
    throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
  };
  assert.equal(await rooms.removeIfEmpty(w.guild, stuck.id), true);
  assert.equal(store.getRoom(stuck.id), null);
});

test("the sweep deletes empty old rooms, forgets vanished ones and respects the grace period", async () => {
  const w = world();
  const old = w.add({ name: "old" });
  const young = w.add({ name: "young" });
  const busy = w.add({ name: "busy" });
  busy.members = { size: 2 };
  const text = w.add({ name: "text", type: ChannelType.GuildText, isVoiceBased: () => false });
  for (const [c, at] of [[old, T0 - 3_600_000], [young, T0 - 5_000], [busy, T0 - 3_600_000], [text, T0 - 3_600_000]]) store.recordRoom({ channelId: c.id, guildId: w.guild.id, ownerId: "1", now: at });
  store.recordRoom({ channelId: sf(), guildId: w.guild.id, ownerId: "1", now: T0 - 3_600_000 });
  const result = await rooms.sweepTempVoice(w.client, { now: T0 });
  assert.deepEqual(w.deleted, [old.id]);
  assert.equal(result.removed, 1);
  assert.equal(result.forgotten, 2, "the vanished room and the text channel row");
  assert.ok(w.channels.has(text.id) && w.channels.has(busy.id) && w.channels.has(young.id) && w.channels.has(w.lobby.id));
  const again = await rooms.sweepTempVoice(w.client, { now: T0 });
  assert.deepEqual(again, { removed: 0, forgotten: 0 });
  assert.equal((await rooms.sweepTempVoice(w.client, { now: T0 + 60_000 })).removed, 1, "the young one once it has aged");
  store.forgetRoom(busy.id);
});

test("the sweep skips unavailable servers and servers the bot is not in, and keeps a row on a Discord error", async () => {
  const w = world();
  const c = w.add({ name: "x" });
  store.recordRoom({ channelId: c.id, guildId: w.guild.id, ownerId: "1", now: T0 - 3_600_000 });
  w.guild.available = false;
  await rooms.sweepTempVoice(w.client, { now: T0 });
  assert.deepEqual(w.deleted, []);
  w.guild.available = true;
  w.channels.delete(c.id);
  w.guild.channels.fetch = async () => {
    throw Object.assign(new Error("Service unavailable"), { code: 0 });
  };
  await rooms.sweepTempVoice(w.client, { now: T0 });
  assert.ok(store.getRoom(c.id), "kept: an outage must not erase the record");
  await rooms.sweepTempVoice({ guilds: { cache: new Map() } }, { now: T0 });
  assert.ok(store.getRoom(c.id), "not in that server any more: not touched");
  await rooms.sweepTempVoice({ guilds: { cache: new Map() } }, { now: T0 + 8 * 86_400_000 });
  assert.equal(store.getRoom(c.id), null, "forgotten after a week");
});
