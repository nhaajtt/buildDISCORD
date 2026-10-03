import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, MessageType, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "security-test-"));

const { createRaidDetector, inWindow } = await import("../src/security/raid.js");
const lockdown = await import("../src/security/lockdown.js");
const nuke = await import("../src/security/nukeguard.js");
const guard = await import("../src/security/guard.js");
const { handleDeletion, findExecutor } = await import("../src/security/nukeaction.js");
const { runLockdown } = await import("../src/jobs/lockdown.js");
const khoakhan = (await import("../src/commands/khoakhan.js")).default;
const { getSection, patchSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");

let counter = 0;
const sf = () => `9${String(++counter).padStart(17, "0")}`;
const BOT = sf();
const OWNER = sf();

const perms = (granted) => ({ has: (flag) => granted === "all" || granted.some((name) => P[name] === flag) });

// ---------- sliding window ----------

test("the window counts only recent joins and trips at the threshold", () => {
  let t = 0;
  const det = createRaidDetector({ now: () => t, cooldownMs: 1000 });
  const opts = { limit: 3, windowSec: 10 };
  assert.deepEqual(det.record("g", "m1", opts), { tripped: false, count: 1 });
  t = 4000;
  assert.equal(det.record("g", "m2", opts).count, 2);
  t = 12_000; // the first join is now outside the window
  assert.deepEqual(det.record("g", "m3", opts), { tripped: false, count: 2 });
  t = 13_000;
  const hit = det.record("g", "m4", opts);
  assert.equal(hit.tripped, true);
  assert.equal(hit.count, 3);
});

test("a join notice counted twice changes nothing, and servers are independent", () => {
  const det = createRaidDetector({ now: () => 0 });
  const opts = { limit: 2, windowSec: 10 };
  det.record("a", "same", opts);
  assert.equal(det.record("a", "same", opts).duplicate, true);
  assert.equal(det.record("b", "x1", opts).tripped, false);
  assert.equal(det.record("a", "other", opts).tripped, true);
});

test("after a trip the detector stays quiet for the cooldown, then counts again", () => {
  let t = 0;
  const det = createRaidDetector({ now: () => t, cooldownMs: 5000 });
  const opts = { limit: 2, windowSec: 10 };
  det.record("g", 1, opts);
  assert.equal(det.record("g", 2, opts).tripped, true);
  t = 1000;
  assert.equal(det.record("g", 3, opts).cooling, true);
  assert.equal(det.record("g", 4, opts).tripped, false);
  t = 6000;
  det.record("g", 5, opts);
  assert.equal(det.record("g", 6, opts).tripped, true);
});

test("inWindow drops old and future stamps", () => {
  assert.deepEqual(inWindow([0, 5, 9, 20], 10, 6), [5, 9]);
});

// ---------- fakes ----------

function fakeChannel({ state = "neutral", type = ChannelType.GuildText, canSend = true, manageable = true } = {}) {
  const id = sf();
  const overwrites = new Map();
  const edits = [];
  const set = (kind) => {
    overwrites.delete("everyone");
    if (kind === "allow") overwrites.set("everyone", { allow: new PermissionsBitField(P.SendMessages), deny: new PermissionsBitField() });
    if (kind === "deny") overwrites.set("everyone", { allow: new PermissionsBitField(), deny: new PermissionsBitField(P.SendMessages) });
  };
  set(state);
  const channel = {
    id,
    type,
    manageable,
    edits,
    permissionOverwrites: {
      cache: { get: () => overwrites.get("everyone") },
      edit: async (_role, change) => {
        edits.push(change);
        set(change.SendMessages === false ? "deny" : change.SendMessages === true ? "allow" : "neutral");
      },
    },
    permissionsFor: () => ({ has: () => canSend && !overwrites.get("everyone")?.deny.has(P.SendMessages) }),
  };
  channel.state = () => (overwrites.get("everyone")?.allow.has(P.SendMessages) ? "allow" : overwrites.get("everyone")?.deny.has(P.SendMessages) ? "deny" : "neutral");
  return channel;
}

function fakeGuild({ granted = "all", verificationLevel = 1, channels = [] } = {}) {
  const id = sf();
  const sent = [];
  const cache = new Collection();
  for (const c of channels) cache.set(c.id, c);
  const system = { id: sf(), send: async (payload) => sent.push(payload), permissionsFor: () => perms("all") };
  const guild = {
    id,
    ownerId: OWNER,
    verificationLevel,
    sent,
    systemChannel: system,
    channels: { cache },
    roles: { everyone: { id } },
    members: { me: { id: BOT, permissions: perms(granted), roles: { highest: { position: 10 } } } },
    setVerificationLevel: async (level) => {
      guild.verificationLevel = level;
    },
  };
  return guild;
}

const admin = { permissions: perms("all") };
function fakeInteraction({ guild, sub, options = {}, member = admin }) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild?.id,
    member,
    user: { id: sf() },
    options: {
      getSubcommand: () => sub,
      getBoolean: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getString: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
    },
    reply: async (payload) => replies.push(payload),
  };
}

// ---------- lockdown planning ----------

test("planLock records the previous state and skips what it should not change", () => {
  const neutral = fakeChannel();
  const allow = fakeChannel({ state: "allow" });
  const deny = fakeChannel({ state: "deny" });
  const voice = fakeChannel({ type: ChannelType.GuildVoice });
  const readOnly = fakeChannel({ canSend: false });
  const locked = fakeChannel({ manageable: false });
  const plan = lockdown.planLock([neutral, allow, deny, voice, readOnly, locked], "g", { id: "g" });
  assert.deepEqual(plan, [
    { id: neutral.id, sendMessages: "neutral" },
    { id: allow.id, sendMessages: "allow" },
  ]);
});

test("planLock never records more than the settings can hold", () => {
  const many = Array.from({ length: 200 }, () => fakeChannel());
  assert.equal(lockdown.planLock(many, "g", { id: "g" }).length, lockdown.MAX_CHANNELS);
});

test("verification helpers only move one step and only restore their own change", () => {
  assert.equal(lockdown.raisedVerification(1), 2);
  assert.equal(lockdown.raisedVerification(4), null);
  assert.equal(lockdown.shouldRestoreVerification(1, 2), true);
  assert.equal(lockdown.shouldRestoreVerification(1, 3), false);
  assert.equal(lockdown.shouldRestoreVerification(null, 2), false);
});

// ---------- lockdown against a fake server ----------

test("lockdown denies SendMessages and unlock restores exactly the previous state", async () => {
  const neutral = fakeChannel();
  const allow = fakeChannel({ state: "allow" });
  const alreadyDeny = fakeChannel({ state: "deny" });
  const noSend = fakeChannel({ canSend: false });
  const voice = fakeChannel({ type: ChannelType.GuildVoice });
  const guild = fakeGuild({ channels: [neutral, allow, alreadyDeny, noSend, voice] });

  const started = await guard.startLockdown(guild, { now: 1000 });
  assert.equal(started.ok, true);
  assert.equal(started.locked, 2);
  assert.equal(neutral.state(), "deny");
  assert.equal(allow.state(), "deny");
  const saved = getSection(guild.id, "security").lockdown;
  assert.equal(saved.active, true);
  assert.deepEqual(saved.channels, [
    { id: neutral.id, sendMessages: "neutral" },
    { id: allow.id, sendMessages: "allow" },
  ]);
  // channels the lockdown did not change were never edited
  for (const untouched of [alreadyDeny, noSend, voice]) assert.equal(untouched.edits.length, 0);

  const stopped = await guard.stopLockdown(guild);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.restored, 2);
  assert.equal(neutral.state(), "neutral");
  assert.equal(allow.state(), "allow");
  assert.equal(alreadyDeny.state(), "deny", "an overwrite that was already a deny stays a deny");
  for (const untouched of [alreadyDeny, noSend, voice]) assert.equal(untouched.edits.length, 0);
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
});

test("lockdown is idempotent: a second start and a second stop do nothing", async () => {
  const c = fakeChannel();
  const guild = fakeGuild({ channels: [c] });
  assert.equal((await guard.startLockdown(guild)).ok, true);
  assert.equal((await guard.startLockdown(guild)).reason, "active");
  assert.equal(c.edits.length, 1);
  assert.equal((await guard.stopLockdown(guild)).ok, true);
  const again = await guard.stopLockdown(guild);
  assert.equal(again.ok, false);
  assert.equal(again.reason, "inactive");
  assert.equal(c.edits.length, 2);
});

test("unlock leaves a channel alone when someone changed it by hand, or it vanished", async () => {
  const kept = fakeChannel();
  const edited = fakeChannel();
  const gone = fakeChannel();
  const guild = fakeGuild({ channels: [kept, edited, gone] });
  await guard.startLockdown(guild);
  await edited.permissionOverwrites.edit(null, { SendMessages: true });
  const editsBefore = edited.edits.length;
  guild.channels.cache.delete(gone.id);
  const stopped = await guard.stopLockdown(guild);
  assert.equal(stopped.restored, 1);
  assert.equal(stopped.skipped, 2);
  assert.equal(edited.edits.length, editsBefore, "the hand-edited channel was not touched");
  assert.equal(kept.state(), "neutral");
});

test("a restart in the middle of a lockdown still unlocks, because the state is in settings", async () => {
  const c = fakeChannel({ state: "allow" });
  const guild = fakeGuild({ channels: [c] });
  await guard.startLockdown(guild, { now: 5000 });
  // a new process reads the same settings and the same server
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) } };
  assert.equal(await runLockdown(client, { now: 5000 + 60_000 }), 0, "not due yet");
  assert.equal(c.state(), "deny");
  const minutes = getSection(guild.id, "security").lockMinutes;
  assert.equal(await runLockdown(client, { now: 5000 + minutes * 60_000 }), 1);
  assert.equal(c.state(), "allow");
  assert.ok(guild.sent.length >= 1, "the auto unlock is announced");
  assert.equal(await runLockdown(client, { now: 5000 + minutes * 60_000 + 1 }), 0);
});

test("the verification level is raised one step and put back only if still ours", async () => {
  const guild = fakeGuild({ verificationLevel: 1 });
  const started = await guard.startLockdown(guild, { channels: false, verify: true });
  assert.deepEqual(started.raised, { from: 1, to: 2 });
  assert.equal(getSection(guild.id, "security").lockdown.prevVerification, 1);
  await guard.stopLockdown(guild);
  assert.equal(guild.verificationLevel, 1);

  const top = fakeGuild({ verificationLevel: 4 });
  assert.equal((await guard.startLockdown(top, { channels: false, verify: true })).reason, "nothing");
  assert.equal(top.verificationLevel, 4);

  const changed = fakeGuild({ verificationLevel: 0 });
  await guard.startLockdown(changed, { channels: false, verify: true });
  changed.verificationLevel = 4; // an admin raised it further by hand
  await guard.stopLockdown(changed);
  assert.equal(changed.verificationLevel, 4);
});

test("lockdown says what permission is missing and changes nothing", async () => {
  const c = fakeChannel();
  const guild = fakeGuild({ granted: ["ViewChannel"], channels: [c] });
  const result = await guard.startLockdown(guild);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "perms");
  assert.deepEqual(result.missing, ["Quản lý kênh"]);
  assert.equal(c.edits.length, 0);
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
});

// ---------- anti-raid end to end ----------

const joinMessage = (guild, extra = {}) => ({ id: sf(), type: MessageType.UserJoin, guild, author: { id: sf(), bot: false }, ...extra });

test("a raid posts an alert with an unlock button and applies the action", async () => {
  const c = fakeChannel();
  const guild = fakeGuild({ channels: [c] });
  patchSection(guild.id, "security", { raidEnabled: true, raidJoins: 3, raidWindowSec: 30, raidAction: "lock" });
  const det = createRaidDetector();
  assert.equal(await guard.handleRaidJoin(joinMessage(guild), { det }), false);
  assert.equal(await guard.handleRaidJoin(joinMessage(guild), { det }), false);
  assert.equal(await guard.handleRaidJoin(joinMessage(guild), { det }), true);
  assert.equal(c.state(), "deny");
  assert.equal(guild.sent.length, 1);
  const alert = guild.sent[0];
  assert.deepEqual(alert.allowedMentions, { parse: [] });
  assert.equal(alert.components[0].toJSON().components[0].custom_id, "khoakhan:unlock");
  // the same raid continuing does not alert again
  assert.equal(await guard.handleRaidJoin(joinMessage(guild), { det }), false);
  assert.equal(guild.sent.length, 1);
});

test("alert-only mode changes nothing on the server and offers no unlock button", async () => {
  const c = fakeChannel();
  const guild = fakeGuild({ channels: [c], verificationLevel: 1 });
  patchSection(guild.id, "security", { raidEnabled: true, raidJoins: 3, raidAction: "alert" });
  const det = createRaidDetector();
  for (let i = 0; i < 3; i++) await guard.handleRaidJoin(joinMessage(guild), { det });
  assert.equal(guild.sent.length, 1);
  assert.equal(guild.sent[0].components.length, 0);
  assert.equal(c.edits.length, 0);
  assert.equal(guild.verificationLevel, 1);
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
});

test("verify mode raises the level and records it", async () => {
  const guild = fakeGuild({ verificationLevel: 2 });
  patchSection(guild.id, "security", { raidEnabled: true, raidJoins: 3, raidAction: "verify" });
  const det = createRaidDetector();
  for (let i = 0; i < 3; i++) await guard.handleRaidJoin(joinMessage(guild), { det });
  assert.equal(guild.verificationLevel, 3);
  assert.equal(getSection(guild.id, "security").lockdown.prevVerification, 2);
});

test("anti-raid ignores bots, other message types, and servers that did not turn it on", async () => {
  const guild = fakeGuild();
  const calls = [];
  const trigger = async () => calls.push(1);
  const det = createRaidDetector();
  // off by default
  for (let i = 0; i < 20; i++) await guard.handleRaidJoin(joinMessage(guild), { det, trigger });
  assert.equal(calls.length, 0);
  patchSection(guild.id, "security", { raidEnabled: true, raidJoins: 3 });
  for (let i = 0; i < 10; i++) await guard.handleRaidJoin(joinMessage(guild, { author: { id: sf(), bot: true } }), { det, trigger });
  for (let i = 0; i < 10; i++) await guard.handleRaidJoin(joinMessage(guild, { type: MessageType.Default }), { det, trigger });
  assert.equal(calls.length, 0);
  assert.equal(await guard.handleRaidJoin({ type: MessageType.UserJoin, guild: null, author: { id: "1" } }, { det, trigger }), false);
  assert.equal(await guard.handleRaidJoin(null, { det, trigger }), false);
});

test("a failing alert channel does not break the raid handler", async () => {
  const guild = fakeGuild();
  guild.systemChannel.send = async () => {
    throw new Error("Missing Access");
  };
  patchSection(guild.id, "security", { raidEnabled: true, raidJoins: 3, raidAction: "alert" });
  const det = createRaidDetector();
  for (let i = 0; i < 3; i++) assert.doesNotThrow(() => guard.handleRaidJoin(joinMessage(guild), { det }));
  await guard.handleRaidJoin(joinMessage(guild), { det });
});

// ---------- /khoakhan ----------

test("/khoakhan refuses someone who is not an administrator", async () => {
  const guild = fakeGuild({ channels: [fakeChannel()] });
  for (const sub of ["bat", "tat", "trangthai", "caidat", "nhatky"]) {
    const i = fakeInteraction({ guild, sub, member: { permissions: perms(["ManageGuild"]) } });
    await khoakhan.execute(i);
    assert.match(i.replies[0].content, /Administrator/);
  }
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
  assert.equal(khoakhan.data.default_member_permissions, String(P.Administrator));
});

test("/khoakhan bat then tat locks and restores, and says so when repeated", async () => {
  const c = fakeChannel({ state: "allow" });
  const guild = fakeGuild({ channels: [c] });
  const bat = fakeInteraction({ guild, sub: "bat" });
  await khoakhan.execute(bat);
  assert.match(bat.replies[0].content, /Khoá công trường xong/);
  assert.equal(c.state(), "deny");

  const again = fakeInteraction({ guild, sub: "bat" });
  await khoakhan.execute(again);
  assert.match(again.replies[0].content, /đang khoá rồi/);

  const tat = fakeInteraction({ guild, sub: "tat" });
  await khoakhan.execute(tat);
  assert.match(tat.replies[0].content, /Mở cổng/);
  assert.equal(c.state(), "allow");

  const twice = fakeInteraction({ guild, sub: "tat" });
  await khoakhan.execute(twice);
  assert.match(twice.replies[0].content, /Có khoá gì đâu/);
});

test("/khoakhan bat reports missing bot permissions", async () => {
  const guild = fakeGuild({ granted: [], channels: [fakeChannel()] });
  const i = fakeInteraction({ guild, sub: "bat" });
  await khoakhan.execute(i);
  assert.match(i.replies[0].content, /Quản lý kênh/);
});

test("/khoakhan caidat stores clean values and gates anti-nuke by plan", async () => {
  const free = fakeGuild();
  const i = fakeInteraction({ guild: free, sub: "caidat", options: { raid: true, solan: 5, hanhdong: "lock", chongxoa: true } });
  await khoakhan.execute(i);
  assert.match(i.replies[0].content, /Pro/);
  assert.equal(getSection(free.id, "security").nukeEnabled, false);
  assert.equal(getSection(free.id, "security").raidEnabled, false, "nothing is saved when the request is refused");

  const ok = fakeInteraction({ guild: free, sub: "caidat", options: { raid: true, solan: 5, hanhdong: "lock" } });
  await khoakhan.execute(ok);
  assert.deepEqual(
    (({ raidEnabled, raidJoins, raidAction }) => ({ raidEnabled, raidJoins, raidAction }))(getSection(free.id, "security")),
    { raidEnabled: true, raidJoins: 5, raidAction: "lock" },
  );

  const hostile = fakeInteraction({ guild: free, sub: "caidat", options: { solan: 9999, hanhdong: "<script>", giay: -4 } });
  await khoakhan.execute(hostile);
  const s = getSection(free.id, "security");
  assert.equal(s.raidJoins, 50);
  assert.equal(s.raidAction, "verify");
  assert.equal(s.raidWindowSec, 10);

  const pro = fakeGuild();
  grant(pro.id, "pro", 30);
  const yes = fakeInteraction({ guild: pro, sub: "caidat", options: { chongxoa: true, xoasolan: 4 } });
  await khoakhan.execute(yes);
  assert.equal(getSection(pro.id, "security").nukeEnabled, true);
  assert.equal(getSection(pro.id, "security").nukeThreshold, 4);
});

test("/khoakhan nhatky turns the mod log on with a channel the bot can post in", async () => {
  const guild = fakeGuild();
  const logChannel = { id: sf(), permissionsFor: () => perms("all") };
  const i = fakeInteraction({ guild, sub: "nhatky", options: { kenh: logChannel } });
  await khoakhan.execute(i);
  const s = (await import("../src/settings.js")).getSection(guild.id, "modlog");
  assert.equal(s.enabled, true);
  assert.equal(s.channelId, logChannel.id);

  const blind = { id: sf(), permissionsFor: () => perms([]) };
  const bad = fakeInteraction({ guild, sub: "nhatky", options: { kenh: blind } });
  await khoakhan.execute(bad);
  assert.match(bad.replies[0].content, /không gửi tin được/);
});

test("the unlock button is checked again for the person who presses it", async () => {
  const c = fakeChannel();
  const guild = fakeGuild({ channels: [c] });
  await guard.startLockdown(guild);
  const press = (member) => {
    const replies = [];
    let edited = false;
    return {
      replies,
      guild,
      member,
      message: { edit: async () => (edited = true) },
      reply: async (p) => replies.push(p),
      get edited() {
        return edited;
      },
    };
  };
  const stranger = press({ permissions: perms(["ManageGuild"]) });
  await khoakhan.handleComponent(stranger, ["unlock"]);
  assert.match(stranger.replies[0].content, /Administrator/);
  assert.equal(c.state(), "deny");

  const boss = press(admin);
  await khoakhan.handleComponent(boss, ["unlock"]);
  assert.equal(c.state(), "neutral");
  assert.equal(boss.edited, true);

  const stale = press(admin);
  await khoakhan.handleComponent(stale, ["unlock"]);
  assert.match(stale.replies[0].content, /cũ/);
});

// ---------- anti-nuke: pure ----------

test("the nuke counter trips at the threshold per person", () => {
  let t = 0;
  const c = nuke.createNukeCounter({ now: () => t, cooldownMs: 1000 });
  const o = { threshold: 3, windowSec: 60 };
  assert.equal(c.record("g", "a", o).tripped, false);
  assert.equal(c.record("g", "b", o).tripped, false);
  assert.equal(c.record("g", "a", o).tripped, false);
  t = 61_000;
  assert.equal(c.record("g", "a", o).count, 1, "old deletions expire");
  t = 62_000;
  c.record("g", "a", o);
  assert.equal(c.record("g", "a", o).tripped, true);
  assert.equal(c.record("g", "a", o).cooling, true);
});

test("the owner, the bot and an unknown person are never acted on", () => {
  assert.equal(nuke.ignoreExecutor({ executorId: OWNER, ownerId: OWNER, botId: BOT }), "owner");
  assert.equal(nuke.ignoreExecutor({ executorId: BOT, ownerId: OWNER, botId: BOT }), "bot");
  assert.equal(nuke.ignoreExecutor({ executorId: null, ownerId: OWNER, botId: BOT }), "unknown");
  assert.equal(nuke.ignoreExecutor({ executorId: "x", ownerId: OWNER, botId: BOT }), null);
});

const role = (name, position, bits, extra = {}) => ({ id: sf(), name, position, permissions: new PermissionsBitField(bits), managed: false, ...extra });

test("only unmanaged dangerous roles below the bot are picked", () => {
  const everyone = role("@everyone", 0, P.Administrator, { id: "gid" });
  const mod = role("Mod", 3, P.BanMembers | P.KickMembers);
  const chat = role("Chat", 2, P.SendMessages);
  const bot = role("Integration", 4, P.Administrator, { managed: true });
  const boss = role("Boss", 12, P.Administrator);
  const equal = role("Same", 10, P.ManageRoles);
  const { strip, kept } = nuke.pickStrippable([everyone, mod, chat, bot, boss, equal], { guildId: "gid", botHighest: 10 });
  assert.deepEqual(strip, [mod]);
  assert.deepEqual(kept.map((k) => [k.role.name, k.why]), [["Integration", "managed"], ["Boss", "above"], ["Same", "above"]]);
});

test("memberRefusal covers the owner, the bot and anyone at or above the bot", () => {
  const base = { ownerId: OWNER, botId: BOT, botHighest: 10 };
  assert.equal(nuke.memberRefusal({ ...base, memberId: OWNER, memberHighest: 1 }), "owner");
  assert.equal(nuke.memberRefusal({ ...base, memberId: BOT, memberHighest: 1 }), "bot");
  assert.equal(nuke.memberRefusal({ ...base, memberId: "x", memberHighest: 10 }), "above");
  assert.equal(nuke.memberRefusal({ ...base, memberId: "x", memberHighest: 9 }), null);
});

// ---------- anti-nuke: against a fake server ----------

function nukeGuild({ granted = "all" } = {}) {
  const guild = fakeGuild({ granted });
  const members = new Map();
  guild.members.fetch = async (id) => members.get(id) ?? Promise.reject(new Error("Unknown Member"));
  guild.addMember = (id, roles, top) => {
    const cache = new Collection(roles.map((r) => [r.id, r]));
    const removed = [];
    const member = {
      id,
      removed,
      roles: {
        cache,
        highest: { position: top ?? Math.max(0, ...roles.map((r) => r.position)) },
        remove: async (ids) => {
          removed.push(...ids);
          for (const rid of ids) cache.delete(rid);
        },
      },
    };
    members.set(id, member);
    return member;
  };
  return guild;
}

const deleteMany = async (guild, who, n, opts = {}) => {
  let last;
  for (let i = 0; i < n; i++) last = await handleDeletion(guild, sf(), 12, { botId: BOT, delayMs: 0, find: async () => who, ...opts });
  return last;
};

test("anti-nuke is a Pro feature and stays off until switched on", async () => {
  const free = nukeGuild();
  patchSection(free.id, "security", { nukeEnabled: true, nukeThreshold: 2 });
  const r = await deleteMany(free, "5000", 5);
  assert.equal(r.reason, "off");
  assert.equal(free.sent.length, 0);

  const pro = nukeGuild();
  grant(pro.id, "pro", 30);
  const r2 = await deleteMany(pro, "5000", 5);
  assert.equal(r2.reason, "off", "plan allows it but the switch is off");
});

test("a burst of deletions raises an alert and strips dangerous roles, recording them", async () => {
  const guild = nukeGuild();
  grant(guild.id, "pro", 30);
  patchSection(guild.id, "security", { nukeEnabled: true, nukeThreshold: 3, nukeWindowSec: 60 });
  const mod = role("Mod", 3, P.BanMembers);
  const chat = role("Chat", 2, P.SendMessages);
  const managed = role("Integration", 4, P.Administrator, { managed: true });
  const above = role("Boss", 12, P.ManageGuild);
  const culprit = guild.addMember("7001", [mod, chat, managed], 4);

  const early = await deleteMany(guild, "7001", 2);
  assert.equal(early.reason, "below");
  assert.equal(guild.sent.length, 0);
  const hit = await deleteMany(guild, "7001", 1);
  assert.equal(hit.handled, true);
  assert.deepEqual(culprit.removed, [mod.id]);
  assert.equal(culprit.roles.cache.has(chat.id), true, "harmless roles stay");
  assert.equal(culprit.roles.cache.has(managed.id), true, "managed roles stay");
  const text = guild.sent[0].embeds[0].toJSON().description;
  assert.ok(text.includes(mod.id), "the removed role is recorded in the alert");
  assert.ok(text.includes(managed.id));
  assert.deepEqual(guild.sent[0].allowedMentions, { parse: [] });

  // someone above the bot is reported but not touched
  const high = guild.addMember("7002", [above, mod], 12);
  await deleteMany(guild, "7002", 3);
  assert.deepEqual(high.removed, []);
  assert.equal(guild.sent.length, 2);
});

test("anti-nuke never acts on the owner, the bot, or an unknown executor", async () => {
  const guild = nukeGuild();
  grant(guild.id, "pro", 30);
  patchSection(guild.id, "security", { nukeEnabled: true, nukeThreshold: 2 });
  assert.equal((await deleteMany(guild, OWNER, 6)).reason, "ignored");
  assert.equal((await deleteMany(guild, BOT, 6)).reason, "ignored");
  assert.equal((await deleteMany(guild, null, 6)).reason, "ignored");
  assert.equal(guild.sent.length, 0);
});

test("without Manage Roles it only alerts, without the audit log it stays quiet", async () => {
  const guild = nukeGuild({ granted: ["ViewChannel", "SendMessages", "EmbedLinks", "ViewAuditLog"] });
  grant(guild.id, "pro", 30);
  patchSection(guild.id, "security", { nukeEnabled: true, nukeThreshold: 2 });
  const culprit = guild.addMember("7003", [role("Mod", 3, P.BanMembers)], 3);
  const r = await deleteMany(guild, "7003", 2);
  assert.equal(r.handled, true);
  assert.deepEqual(culprit.removed, []);
  assert.match(guild.sent[0].embeds[0].toJSON().description, /Quản lý role/);

  const blind = nukeGuild({ granted: ["ViewChannel"] });
  assert.equal(await findExecutor(blind, 12, "1", { delayMs: 0 }), null);
});

test("findExecutor matches the audit entry for the deleted thing only", async () => {
  const guild = nukeGuild();
  const entries = new Collection([
    ["a", { targetId: "111", executorId: "e1", createdTimestamp: Date.now() }],
    ["b", { targetId: "222", executorId: "e2", createdTimestamp: Date.now() }],
    ["c", { targetId: "333", executorId: "e3", createdTimestamp: Date.now() - 600_000 }],
  ]);
  guild.fetchAuditLogs = async () => ({ entries });
  assert.equal(await findExecutor(guild, 12, "222", { delayMs: 0 }), "e2");
  assert.equal(await findExecutor(guild, 12, "999", { delayMs: 0 }), null);
  assert.equal(await findExecutor(guild, 12, "333", { delayMs: 0 }), null, "an old entry is not this deletion");
  guild.fetchAuditLogs = async () => {
    throw new Error("boom");
  };
  assert.equal(await findExecutor(guild, 12, "222", { delayMs: 0 }), null);
});
