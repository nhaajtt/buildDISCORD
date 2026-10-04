import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Collection, Events, PermissionFlagsBits as P } from "discord.js";
import { ChannelType, FakeChannel, FakeMember, apiError, createGateway, effectiveOverwrites, textOf } from "./gateway.js";

const gw = await createGateway({ env: { STRIPE_SECRET_KEY: "sk_test_e2e", PAYOS_CLIENT_ID: null, PAYOS_API_KEY: null, PAYOS_CHECKSUM_KEY: null, UNLOCKED_GUILD_IDS: null, OWNER_IDS: null, ALERT_WEBHOOK_URL: null } });
after(() => gw.close());

const { getSection, patchSection } = await import("../../src/settings.js");
const { grant } = await import("../../src/license.js");
const { getDb } = await import("../../src/db.js");
const { loadRecord } = await import("../../src/store.js");
const store = await import("../../src/tempvoice/store.js");

// ---------------------------------------------------------------- what the fake gateway does not model yet, added here without touching it

Object.defineProperty(FakeChannel.prototype, "members", {
  configurable: true,
  get() {
    const out = new Collection();
    for (const v of this.guild.voiceStates.cache.values()) if (v.channelId === this.id && v.member) out.set(v.id, v.member);
    return out;
  },
});

// Discord allows two renames per channel per 10 minutes; a third inside the window is refused
FakeChannel.prototype.setName = async function setName(name, reason) {
  const gwHere = this.guild.gw;
  const me = this.guild.members.me;
  if (!this.permissionsFor(me).has(P.ManageChannels)) throw apiError(50013, "Missing Permissions", 403);
  const now = gwHere.clock.now();
  this.renames = (this.renames ?? []).filter((t) => now - t < 10 * 60_000);
  if (this.renames.length >= 2) throw apiError(429, "You are being rate limited", 429);
  this.renames.push(now);
  const before = this.name;
  this.name = name;
  gwHere.record("channelRename", { guildId: this.guild.id, channelId: this.id, before, name, reason });
  return this;
};

Object.defineProperty(FakeMember.prototype, "voice", {
  configurable: true,
  get() {
    const member = this;
    const guild = this.guild;
    return {
      get channelId() {
        return guild.voiceStates.cache.get(member.id)?.channelId ?? null;
      },
      async setChannel(channel, reason) {
        const old = guild.voiceStates.cache.get(member.id);
        if (!old) throw apiError(40032, "Target user is not connected to voice", 400);
        if (!guild.members.me.permissions.has(P.MoveMembers)) throw apiError(50013, "Missing Permissions", 403);
        const target = typeof channel === "string" ? guild.channels.cache.get(channel) : channel;
        const next = { id: member.id, guild, member, channelId: target.id, channel: target, selfDeaf: false, serverDeaf: false };
        guild.voiceStates.cache.set(member.id, next);
        guild.gw.record("voiceMove", { guildId: guild.id, userId: member.id, channelId: target.id, reason });
        // Discord reports the move as its own event, after the call returned
        guild.gw.background(guild.gw.emit(Events.VoiceStateUpdate, old, next));
        return member;
      },
    };
  },
});

// Remembers userLimit like Discord, and lets a test do something in the middle of a channel being made
function wrap(guild) {
  const create = guild.channels.create;
  guild.hooks = {};
  guild.channels.create = async (o) => {
    const channel = await create(o);
    if (o.userLimit !== undefined) channel.userLimit = o.userLimit;
    await guild.hooks.afterCreate?.(channel, o);
    return channel;
  };
  return guild;
}

function setup(options = {}) {
  const guild = wrap(gw.createGuild(options));
  const admin = gw.addAdmin(guild);
  const lobby = guild.addChannel({ name: "Vào đây để tạo phòng", type: ChannelType.GuildVoice });
  const category = guild.addChannel({ name: "Phòng tạm", type: ChannelType.GuildCategory });
  return { guild, admin, lobby, category };
}

const phongtam = (ctx, sub, options = {}, member = ctx.admin) => gw.slash("phongtam", { guild: ctx.guild, member, sub, options });
const roomsOf = (guild) => [...guild.channels.cache.values()].filter((c) => store.getRoom(c.id));
const rowCount = (guild) => store.countRooms(guild.id);
const allow = P.ViewChannel | P.Connect | P.ManageChannels | P.MoveMembers;

async function configure(ctx, options = {}) {
  const res = await phongtam(ctx, "caidat", { kenh: ctx.lobby, danhmuc: ctx.category, mauten: "Phòng của {name}", ...options });
  assert.match(res.text, /phòng chờ/);
  return res;
}

// ---------------------------------------------------------------- happy path, owner scope, deletion when empty

test("a person joins the lobby, gets a room of their own, and it is deleted when the last person leaves", async () => {
  const ctx = setup();
  const { guild, category, lobby } = ctx;
  // the category has its own rule for a role; the new room must keep it
  const staff = guild.addRole({ name: "Nhân viên", permissions: 0n, position: 5 });
  await category.permissionOverwrites.edit(staff.id, { ViewChannel: false });
  await configure(ctx, { gioihan: 5 });
  const settings = getSection(guild.id, "tempvoice");
  assert.equal(settings.enabled, true);
  assert.deepEqual(settings.lobbyChannelIds, [lobby.id]);
  assert.equal(settings.userLimit, 5);

  const mai = gw.addPerson(guild, "Mai");
  const mark = gw.mark();
  await gw.voice(mai, lobby);
  await gw.settle();

  const rooms = roomsOf(guild);
  assert.equal(rooms.length, 1);
  const room = rooms[0];
  assert.equal(room.name, "Phòng của Mai");
  assert.equal(room.type, ChannelType.GuildVoice);
  assert.equal(room.parentId, category.id);
  assert.equal(room.userLimit, 5);
  assert.equal(guild.voiceStates.cache.get(mai.id).channelId, room.id, "the person was moved into the room");
  assert.equal(store.getRoom(room.id).owner_id, mai.id);

  // what the owner may do is limited to this one channel, and nothing else was granted to anyone
  const own = room.permissionOverwrites.cache.get(mai.id);
  assert.equal(own.allow.bitfield, allow);
  assert.equal(own.deny.bitfield, 0n);
  assert.ok(!own.allow.has(P.ManageRoles) && !own.allow.has(P.Administrator) && !own.allow.has(P.ManageGuild) && !own.allow.has(P.KickMembers));
  assert.deepEqual(effectiveOverwrites(room).sort(), [`${staff.id}:0:${P.ViewChannel}`, `${mai.id}:${allow}:0`].sort(), "the category's rule was copied, the owner's was added, nothing else");
  assert.equal(guild.roles.cache.get(mai.id), undefined);
  assert.equal(gw.since(mark).filter((r) => r.kind === "roleAdd" || r.kind === "roleCreate").length, 0, "no role was touched");

  // another person joins the room, the owner leaves: the room stays
  const binh = gw.addPerson(guild, "Bình");
  await gw.voice(binh, room);
  await gw.voice(mai, null);
  await gw.settle();
  assert.ok(guild.channels.cache.has(room.id));
  // the last one leaves: the room goes, the row goes, nothing else is deleted
  const deletesBefore = gw.find("channelDelete").length;
  await gw.voice(binh, null);
  await gw.settle();
  assert.ok(!guild.channels.cache.has(room.id));
  assert.equal(store.getRoom(room.id), null);
  const deletes = gw.find("channelDelete").slice(deletesBefore);
  assert.deepEqual(deletes.map((r) => r.channelId), [room.id]);
  assert.ok(guild.channels.cache.has(lobby.id) && guild.channels.cache.has(category.id));
});

test("two people joining the lobby together each get their own room with their own owner", async () => {
  const ctx = setup();
  await configure(ctx);
  const [a, b] = [gw.addPerson(ctx.guild, "An"), gw.addPerson(ctx.guild, "Bảo")];
  await Promise.all([gw.voice(a, ctx.lobby), gw.voice(b, ctx.lobby)]);
  await gw.settle();
  const rooms = roomsOf(ctx.guild);
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms.map((r) => store.getRoom(r.id).owner_id).sort(), [a.id, b.id].sort());
  for (const room of rooms) assert.equal(room.permissionOverwrites.cache.size, 1, "only its owner has an overwrite");
});

// ---------------------------------------------------------------- permission refusal, plan gating

test("only an administrator can set the rooms up, and a refused person changes nothing", async () => {
  const ctx = setup();
  const mod = gw.addMod(ctx.guild, "mod");
  const res = await gw.slash("phongtam", { guild: ctx.guild, member: mod, sub: "them", options: { kenh: ctx.lobby }, hidden: true });
  assert.ok(res.last.content.length > 0);
  assert.deepEqual(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds, []);
  await assert.rejects(() => gw.slash("phongtam", { guild: ctx.guild, member: mod, sub: "tat", options: {} }), /hide/);
  const stranger = gw.addPerson(ctx.guild, "khach");
  const res2 = await gw.slash("phongtam", { guild: ctx.guild, member: stranger, sub: "caidat", options: { kenh: ctx.lobby }, hidden: true });
  assert.equal(getSection(ctx.guild.id, "tempvoice").enabled, false);
  assert.ok(res2.last.content.length > 0);
});

test("the number of lobbies follows the plan: one when free, three on Pro", async () => {
  const ctx = setup();
  const more = [1, 2, 3].map((i) => ctx.guild.addChannel({ name: `phòng chờ ${i}`, type: ChannelType.GuildVoice }));
  assert.match((await phongtam(ctx, "them", { kenh: ctx.lobby })).text, /1\/1/);
  const refused = await phongtam(ctx, "them", { kenh: more[0] });
  assert.match(refused.text, /hết 1/);
  assert.equal(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds.length, 1);
  assert.match((await phongtam(ctx, "them", { kenh: ctx.lobby })).text, /từ trước/, "the same lobby twice is not added twice");

  grant(ctx.guild.id, "pro", 30, gw.clock.now());
  await phongtam(ctx, "them", { kenh: more[0] });
  await phongtam(ctx, "them", { kenh: more[1] });
  assert.match((await phongtam(ctx, "them", { kenh: more[2] })).text, /hết 3/);
  assert.equal(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds.length, 3);

  // a plan that ends leaves the extra lobbies idle: only the first one still works
  const cheap = setup();
  grant(cheap.guild.id, "pro", 1, gw.clock.now());
  const spare = cheap.guild.addChannel({ name: "thứ hai", type: ChannelType.GuildVoice });
  await phongtam(cheap, "them", { kenh: cheap.lobby });
  await phongtam(cheap, "them", { kenh: spare });
  await gw.advance(3 * 86_400_000);
  const person = gw.addPerson(cheap.guild, "Chi");
  await gw.voice(person, spare);
  await gw.settle();
  assert.equal(roomsOf(cheap.guild).length, 0, "the second lobby no longer works on the free plan");
  await gw.voice(person, null);
  await gw.voice(person, cheap.lobby);
  await gw.settle();
  assert.equal(roomsOf(cheap.guild).length, 1);
});

test("a temporary room, a text channel and a stage cannot be made a lobby", async () => {
  const ctx = setup();
  await configure(ctx);
  const person = gw.addPerson(ctx.guild, "Dũng");
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  const room = roomsOf(ctx.guild)[0];
  const res = await phongtam(ctx, "them", { kenh: room });
  assert.match(res.text, /phòng tạm/);
  assert.deepEqual(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds, [ctx.lobby.id]);
  await assert.rejects(() => phongtam(ctx, "them", { kenh: ctx.guild.systemChannel }), /not allowed/);
});

// ---------------------------------------------------------------- hostile input, nothing foreign is deleted

test("hostile names are cleaned and capped, and channels that are not rooms are never deleted", async () => {
  const ctx = setup();
  await configure(ctx, { mauten: "{name} @everyone <@123> {name}‮" });
  const evil = ctx.guild.addMember({ name: "x", nickname: `ev‮il @everyone #${"y".repeat(150)}\u0007\n:` });
  await gw.voice(evil, ctx.lobby);
  await gw.settle();
  const room = roomsOf(ctx.guild)[0];
  assert.ok(room.name.length > 0 && room.name.length <= 100, `length ${room.name.length}`);
  assert.doesNotMatch(room.name, /[\u0000-\u001f‪-‮]/);
  assert.doesNotMatch(room.name, /\n/);

  // somebody else's voice channel and the lobby itself are emptied: neither is touched
  const other = ctx.guild.addChannel({ name: "Họp nhóm", type: ChannelType.GuildVoice });
  const person = gw.addPerson(ctx.guild, "Em");
  const before = gw.find("channelDelete").length;
  await gw.voice(person, other);
  await gw.voice(person, null);
  await gw.voice(person, ctx.lobby);
  await gw.voice(person, null);
  await gw.settle();
  assert.ok(ctx.guild.channels.cache.has(other.id) && ctx.guild.channels.cache.has(ctx.lobby.id));
  const gone = gw.find("channelDelete").slice(before).map((r) => r.channelId);
  assert.ok(!gone.includes(other.id) && !gone.includes(ctx.lobby.id));

  // a template longer than any room name still fits
  patchSection(ctx.guild.id, "tempvoice", { nameTemplate: "{name}".repeat(40) });
  const long = ctx.guild.addMember({ name: "z", nickname: "n".repeat(32) });
  await gw.voice(long, ctx.lobby);
  await gw.settle();
  assert.ok(roomsOf(ctx.guild).every((r) => r.name.length <= 100));
});

test("a template that cleans down to nothing still gives a usable room name", async () => {
  const ctx = setup();
  await configure(ctx);
  patchSection(ctx.guild.id, "tempvoice", { nameTemplate: "​" });
  assert.equal(getSection(ctx.guild.id, "tempvoice").nameTemplate.length > 0, true);
  const person = gw.addPerson(ctx.guild, "Gia");
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.ok(roomsOf(ctx.guild)[0].name.length > 0);
});

// ---------------------------------------------------------------- cooldown and cap

test("one person cannot spam rooms: ten seconds between two, and the server holds at most 50", async () => {
  const ctx = setup();
  await configure(ctx);
  const person = gw.addPerson(ctx.guild, "Hà");
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  await gw.voice(person, null); // empties and deletes the first room
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0);
  await gw.advance(4_000);
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0, "four seconds later: no new room");
  assert.equal(ctx.guild.voiceStates.cache.get(person.id).channelId, ctx.lobby.id, "the person stays where they are");
  await gw.voice(person, null);
  await gw.advance(7_000);
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 1, "eleven seconds after the first: allowed");

  // the cap
  const capped = setup();
  await configure(capped);
  for (let i = 0; i < 50; i++) store.recordRoom({ channelId: `7${String(i).padStart(18, "0")}`, guildId: capped.guild.id, ownerId: "1", now: gw.clock.now() });
  assert.equal(rowCount(capped.guild), 50);
  const late = gw.addPerson(capped.guild, "Khoa");
  const channelsBefore = capped.guild.channels.cache.size;
  await gw.voice(late, capped.lobby);
  await gw.settle();
  assert.equal(capped.guild.channels.cache.size, channelsBefore, "no 51st room");
  const dms = gw.find("dm", (r) => r.userId === late.id);
  assert.equal(dms.length, 1);
  assert.match(textOf(dms[0].payload), /50 phòng/);
});

// ---------------------------------------------------------------- things that can go wrong

test("missing permissions are named to the person and nothing half-made is left behind", async () => {
  const ctx = setup({ botPermissions: ["ViewChannel", "Connect", "SendMessages"] });
  await configure(ctx);
  const person = gw.addPerson(ctx.guild, "Lan");
  const status = await phongtam(ctx, "trangthai");
  assert.match(textOf(status.last), /Quản lý kênh/);
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0);
  assert.equal(rowCount(ctx.guild), 0);
  const dm = gw.find("dm", (r) => r.userId === person.id);
  assert.equal(dm.length, 1);
  assert.match(textOf(dm[0].payload), /Quản lý kênh/);
  assert.match(textOf(dm[0].payload), /Di chuyển thành viên/);
  // a closed inbox does not break anything
  const closed = ctx.guild.addMember({ name: "kín", dmOpen: false });
  await gw.voice(closed, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0);
});

test("a full category is reported, and a missing category falls back to the lobby's own", async () => {
  const ctx = setup();
  await configure(ctx);
  for (let i = 0; i < 50; i++) ctx.guild.addChannel({ name: `kênh ${i}`, type: ChannelType.GuildText, parentId: ctx.category.id });
  const person = gw.addPerson(ctx.guild, "Minh");
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0);
  assert.match(textOf(gw.find("dm", (r) => r.userId === person.id)[0].payload), /đầy/);

  // the category the admin chose is deleted; the lobby sits in another category, so rooms go there
  const home = ctx.guild.addChannel({ name: "Nhà", type: ChannelType.GuildCategory });
  ctx.lobby.parentId = home.id;
  await gw.deleteChannel(ctx.category);
  await gw.voice(person, null);
  await gw.advance(11_000);
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  const room = roomsOf(ctx.guild)[0];
  assert.ok(room, "a room was made anyway");
  assert.equal(room.parentId, home.id);
});

test("a lobby deleted by hand drops out of the list and the feature keeps working for the others", async () => {
  const ctx = setup();
  grant(ctx.guild.id, "pro", 30, gw.clock.now());
  const second = ctx.guild.addChannel({ name: "chờ 2", type: ChannelType.GuildVoice });
  await phongtam(ctx, "them", { kenh: ctx.lobby });
  await phongtam(ctx, "them", { kenh: second });
  await gw.deleteChannel(ctx.lobby);
  const status = await phongtam(ctx, "trangthai");
  assert.deepEqual(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds, [second.id]);
  assert.match(textOf(status.last), /đã bị xoá/);
  const person = gw.addPerson(ctx.guild, "Oanh");
  await gw.voice(person, second);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 1);
});

test("a person who leaves the lobby while the room is being made gets no room", async () => {
  const ctx = setup();
  await configure(ctx);
  const person = gw.addPerson(ctx.guild, "Phúc");
  ctx.guild.hooks.afterCreate = async () => {
    ctx.guild.voiceStates.cache.delete(person.id);
    ctx.guild.hooks.afterCreate = null;
  };
  const before = gw.since(0).filter((r) => r.kind === "channelCreate").length;
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(gw.find("channelCreate").length - before, 1, "the room was made");
  assert.equal(roomsOf(ctx.guild).length, 0, "and removed again");
  assert.equal(rowCount(ctx.guild), 0, "the row is forgotten too");
  assert.equal(gw.find("voiceMove", (r) => r.userId === person.id).length, 0);
});

test("turning it off, removing the lobby and bots joining the lobby", async () => {
  const ctx = setup();
  await configure(ctx);
  const bot = ctx.guild.addMember({ name: "robot", bot: true });
  await gw.voice(bot, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0, "bots do not get rooms");

  await phongtam(ctx, "tat");
  const person = gw.addPerson(ctx.guild, "Quân");
  await gw.voice(person, ctx.lobby);
  await gw.settle();
  assert.equal(roomsOf(ctx.guild).length, 0);
  assert.deepEqual(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds, [ctx.lobby.id], "off keeps the configuration");

  const res = await phongtam(ctx, "bo", { kenh: ctx.lobby });
  assert.match(res.text, /Đã bỏ/);
  assert.deepEqual(getSection(ctx.guild.id, "tempvoice").lobbyChannelIds, []);
  assert.ok(ctx.guild.channels.cache.has(ctx.lobby.id), "the channel itself stays");
  assert.match((await phongtam(ctx, "bo", { kenh: ctx.lobby })).text, /không nằm/);
});

// ---------------------------------------------------------------- restart safety

test("after a restart the sweep removes empty rooms and forgets rooms that no longer exist, and touches nothing else", async () => {
  const ctx = setup();
  const { guild } = ctx;
  const old = gw.clock.now() - 3_600_000;
  const emptyRoom = guild.addChannel({ name: "phòng cũ trống", type: ChannelType.GuildVoice });
  const busyRoom = guild.addChannel({ name: "phòng cũ có người", type: ChannelType.GuildVoice });
  const freshRoom = guild.addChannel({ name: "phòng mới dựng", type: ChannelType.GuildVoice });
  const foreign = guild.addChannel({ name: "phòng của người ta", type: ChannelType.GuildVoice });
  const textRoom = guild.addChannel({ name: "kênh chữ lạc", type: ChannelType.GuildText });
  const gone = guild.addChannel({ name: "sắp xoá", type: ChannelType.GuildVoice });
  for (const [room, at] of [[emptyRoom, old], [busyRoom, old], [freshRoom, gw.clock.now() - 5_000], [textRoom, old], [gone, old]]) {
    store.recordRoom({ channelId: room.id, guildId: guild.id, ownerId: "1", now: at });
  }
  const sitting = gw.addPerson(guild, "Sang");
  guild.voiceStates.cache.set(sitting.id, { id: sitting.id, guild, member: sitting, channelId: busyRoom.id, channel: busyRoom, selfDeaf: false, serverDeaf: false });
  // a room of another server that is not loaded, and one whose server the bot has left
  store.recordRoom({ channelId: "9".repeat(18), guildId: "8".repeat(18), ownerId: "1", now: old });
  guild.channels.cache.delete(gone.id); // deleted while the bot was down, no event seen

  const before = gw.find("channelDelete").length;
  await gw.runJob("stats");
  const deleted = gw.find("channelDelete").slice(before).map((r) => r.channelId);
  assert.deepEqual(deleted, [emptyRoom.id], "only the empty recorded room is deleted");
  assert.equal(store.getRoom(emptyRoom.id), null);
  assert.equal(store.getRoom(gone.id), null, "the row of a vanished room is forgotten");
  assert.ok(store.getRoom(busyRoom.id), "a room with someone in it stays");
  assert.ok(store.getRoom(freshRoom.id), "a room that was just made stays");
  assert.equal(store.getRoom(textRoom.id), null, "a row that points at a text channel is forgotten, the channel is not deleted");
  assert.ok(guild.channels.cache.has(textRoom.id) && guild.channels.cache.has(foreign.id));
  assert.ok(store.getRoom("9".repeat(18)), "rows of servers that are not loaded are left alone");

  // running it again changes nothing, then the fresh room is swept once it has aged
  await gw.runJob("stats");
  assert.equal(gw.find("channelDelete").length - before, 1);
  await gw.advance(60_000);
  await gw.runJob("stats");
  assert.ok(!guild.channels.cache.has(freshRoom.id));
  assert.ok(guild.channels.cache.has(busyRoom.id));
  getDb().prepare("DELETE FROM temp_voice WHERE guild_id = ?").run("8".repeat(18));
});

// ---------------------------------------------------------------- stats channels

const kenh = (ctx, sub, options = {}, member = ctx.admin) => gw.slash("kenhthongke", { guild: ctx.guild, member, sub, options });
const renames = (guild) => gw.find("channelRename", (r) => r.guildId === guild.id);

test("a stats channel shows its number, changes only when the number changes, and at most once per 10 minutes", async () => {
  const ctx = setup();
  const { guild } = ctx;
  const board = guild.addChannel({ name: "tạm", type: ChannelType.GuildVoice });
  const bystander = guild.addChannel({ name: "Không đụng vào", type: ChannelType.GuildVoice });
  const res = await kenh(ctx, "them", { loai: "members", kenh: board, mauten: "Thành viên: {n}" });
  assert.match(res.text, /1\/1/);
  assert.equal(board.name, `Thành viên: ${guild.memberCount}`, "the first number is shown right away");
  const first = renames(guild).length;
  assert.equal(first, 1);

  // the number changes, but the channel was renamed a moment ago
  gw.addPerson(guild, "mới 1");
  await gw.advance(60_000);
  await gw.runJob("stats");
  assert.equal(renames(guild).length, first, "no rename inside the window");
  // nothing changes: no rename either, even once the window is open
  await gw.advance(10 * 60_000);
  await gw.runJob("stats");
  assert.equal(renames(guild).length, first + 1);
  assert.equal(board.name, `Thành viên: ${guild.memberCount}`);
  await gw.advance(10 * 60_000);
  await gw.runJob("stats");
  await gw.advance(10 * 60_000);
  await gw.runJob("stats");
  assert.equal(renames(guild).length, first + 1, "same number, same name, no call");
  assert.equal(bystander.name, "Không đụng vào");

  // a member joins in each of three consecutive rounds: one rename each, never two in a window
  for (let i = 0; i < 3; i++) {
    gw.addPerson(guild, `đợt ${i}`);
    await gw.advance(10 * 60_000);
    await gw.runJob("stats");
  }
  assert.equal(renames(guild).length, first + 4);
  const times = renames(guild).map((r) => r.at);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 10 * 60_000 - 2000, "gap of ten minutes");
  assert.equal(gw.consoleErrors.filter((e) => /rate limited/.test(e)).length, 0);
});

test("stats channels follow the plan, are cleaned, and need a number placeholder", async () => {
  const ctx = setup();
  const [a, b] = [0, 1].map((i) => ctx.guild.addChannel({ name: `bảng ${i}`, type: ChannelType.GuildVoice }));
  assert.match((await kenh(ctx, "them", { loai: "members", kenh: a, mauten: "Không có số" })).text, /\{n\}/);
  assert.match((await kenh(ctx, "them", { loai: "members" })).text, /Chọn một kênh/);
  assert.match((await kenh(ctx, "them", { loai: "members", kenh: a, tao: true })).text, /một thôi/);
  assert.equal(getSection(ctx.guild.id, "stats").channels.length, 0);

  await kenh(ctx, "them", { loai: "boosts", kenh: a, mauten: "Boost‮: {n}\n{n}" });
  const entry = getSection(ctx.guild.id, "stats").channels[0];
  assert.equal(entry.template, "Boost: {n} {n}");
  assert.match((await kenh(ctx, "them", { loai: "roles", kenh: b })).text, /hết 1/);
  assert.match((await kenh(ctx, "them", { loai: "members", kenh: a })).text, /\/10|đang là kênh thống kê|hết 1/);

  grant(ctx.guild.id, "pro", 30, gw.clock.now());
  assert.match((await kenh(ctx, "them", { loai: "roles", kenh: b })).text, /2\/4/);
  assert.match((await kenh(ctx, "them", { loai: "members", kenh: a })).text, /đang là kênh thống kê/);
  assert.equal(b.name, `Role: ${ctx.guild.roles.cache.size - 1}`);
  const stranger = gw.addMod(ctx.guild, "mod2");
  const refused = await gw.slash("kenhthongke", { guild: ctx.guild, member: stranger, sub: "danhsach", options: {}, hidden: true });
  assert.ok(refused.last.content.length > 0);
});

test("'tao' builds a locked voice channel, records it, and removing it deletes only what the bot built", async () => {
  const ctx = setup();
  grant(ctx.guild.id, "pro", 30, gw.clock.now());
  const { guild } = ctx;
  const mine = await kenh(ctx, "them", { loai: "channels", tao: true });
  assert.match(mine.text, /khoá/);
  const made = gw.find("channelCreate", (r) => r.guildId === guild.id && r.type === ChannelType.GuildVoice).at(-1);
  const channel = guild.channels.cache.get(made.channelId);
  const everyone = channel.permissionOverwrites.cache.get(guild.id);
  assert.ok(everyone.deny.has(P.Connect), "@everyone cannot join");
  assert.equal(everyone.allow.bitfield, 0n);
  const record = loadRecord(guild.id);
  assert.ok(record.channels.includes(channel.id) && record.statChannels.includes(channel.id), "recorded for cleanup");
  assert.equal(channel.name, `Kênh: ${guild.channels.cache.size}`.replace(/\d+$/, (n) => n), "named with a number");
  assert.match(channel.name, /^Kênh: \d+$/);

  // one the admin made, listed too
  const theirs = guild.addChannel({ name: "của admin", type: ChannelType.GuildVoice });
  await kenh(ctx, "them", { loai: "boosts", kenh: theirs, mauten: "Boost {n}" });
  const list = await kenh(ctx, "danhsach");
  assert.match(textOf(list.last), /Kênh: \d+/);
  assert.match(textOf(list.last), /Boost 0/);

  // autocomplete offers what is listed
  const auto = await gw.autocomplete("kenhthongke", { guild, member: ctx.admin, sub: "xoa", focused: { name: "kenh", value: "" } });
  assert.deepEqual(auto.choices.map((c) => c.value).sort(), [channel.id, theirs.id].sort());
  const strangerAuto = await gw.autocomplete("kenhthongke", { guild, member: gw.addPerson(guild, "xem"), sub: "xoa", focused: { name: "kenh", value: "" } });
  assert.deepEqual(strangerAuto.choices, []);

  const bye1 = await kenh(ctx, "xoa", { kenh: channel.id });
  assert.match(bye1.text, /xoá luôn/);
  assert.ok(!guild.channels.cache.has(channel.id));
  assert.ok(!loadRecord(guild.id).channels.includes(channel.id));
  const bye2 = await kenh(ctx, "xoa", { kenh: theirs.id });
  assert.match(bye2.text, /không đập/);
  assert.ok(guild.channels.cache.has(theirs.id), "the admin's own channel stays");
  assert.match((await kenh(ctx, "xoa", { kenh: theirs.id })).text, /không nằm/);
  assert.match((await kenh(ctx, "xoa", { kenh: "không phải số" })).text, /không nằm/);
});

test("a stats channel deleted by hand is dropped, a bot without rights is told, and off means hands off", async () => {
  const ctx = setup();
  const { guild } = ctx;
  const board = guild.addChannel({ name: "x", type: ChannelType.GuildVoice });
  await kenh(ctx, "them", { loai: "members", kenh: board });
  await gw.deleteChannel(board);
  await gw.runJob("stats");
  assert.equal(getSection(guild.id, "stats").channels.length, 0);

  // the bot loses the right to manage channels
  const weak = setup({ botPermissions: ["ViewChannel", "Connect"] });
  const target = weak.guild.addChannel({ name: "đứng yên", type: ChannelType.GuildVoice });
  const added = await kenh(weak, "them", { loai: "members", kenh: target });
  assert.match(added.text, /thiếu quyền/);
  await gw.advance(11 * 60_000);
  await gw.runJob("stats");
  assert.equal(target.name, "đứng yên");
  assert.match(textOf((await kenh(weak, "danhsach")).last), /thiếu quyền/);

  // off: the name stays what it was
  const live = setup();
  const t2 = live.guild.addChannel({ name: "y", type: ChannelType.GuildVoice });
  await kenh(live, "them", { loai: "members", kenh: t2 });
  const frozen = t2.name;
  await kenh(live, "tat");
  gw.addPerson(live.guild, "thêm");
  await gw.advance(11 * 60_000);
  await gw.runJob("stats");
  assert.equal(t2.name, frozen);
});
