import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, MessageFlags, MessageType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "onboarding-test-"));

const { isSafeRole, roleProblem, FORBIDDEN_PERMISSIONS, formatWelcome, escapeText, buildWelcomePost, welcomeMember } = await import("../src/onboarding/index.js");
const { createJoinFilter, handleJoinMessage } = await import("../src/events/messageCreate.js");
const messageCreate = (await import("../src/events/messageCreate.js")).default;
const { getSection, setSection } = await import("../src/settings.js");
const { welcomeDefaults } = await import("../src/humor/onboarding.js");
const chaomung = (await import("../src/commands/chaomung.js")).default;

let counter = 0;
const snowflake = () => `7${String(++counter).padStart(17, "0")}`;

const makeRole = ({ id = snowflake(), name = "Thành viên mới", position = 1, managed = false, bits = 0n, guildId = "0" } = {}) => ({
  id,
  name,
  position,
  managed,
  guild: { id: guildId },
  permissions: { bitfield: bits },
});

// A guild that behaves like discord.js for the calls the welcome flow makes
function fakeGuild({ botTop = 10, canSend = true, withSystem = true, channelInCache = true } = {}) {
  const id = snowflake();
  const sent = [];
  const roles = new Collection();
  const members = new Map();
  const channels = new Collection();
  const channel = {
    id: snowflake(),
    type: ChannelType.GuildText,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => canSend }),
    send: async (payload) => {
      sent.push(payload);
      return payload;
    },
  };
  const system = { ...channel, id: snowflake(), send: async (payload) => (sent.push({ ...payload, viaSystem: true }), payload) };
  if (channelInCache) channels.set(channel.id, channel);
  const guild = {
    id,
    name: "Server Thử",
    sent,
    channel,
    system,
    systemChannel: withSystem ? system : null,
    roles: { cache: roles, fetch: async (rid) => roles.get(rid) ?? null },
    channels: { cache: channels, fetch: async (cid) => channels.get(cid) ?? Promise.reject(new Error("Unknown Channel")) },
    members: {
      me: { roles: { highest: { position: botTop } }, permissions: { has: () => true } },
      fetch: async (uid) => members.get(uid) ?? Promise.reject(new Error("Unknown Member")),
    },
    addRole(options) {
      const role = makeRole({ ...options, guildId: id });
      roles.set(role.id, role);
      return role;
    },
    addMember(uid = snowflake(), { failAdd = false } = {}) {
      const cache = new Collection();
      const member = {
        id: uid,
        roles: {
          cache,
          add: async (role) => {
            if (failAdd) throw new Error("Missing Permissions");
            cache.set(role.id ?? role, role);
          },
          remove: async (role) => cache.delete(role.id ?? role),
        },
      };
      members.set(uid, member);
      return member;
    },
  };
  return guild;
}

test("isSafeRole accepts a plain role below the bot", () => {
  assert.equal(isSafeRole(makeRole({ position: 3, bits: P.ViewChannel | P.SendMessages }), 5), true);
});

test("isSafeRole refuses managed, @everyone, equal or higher position and missing roles", () => {
  assert.equal(isSafeRole(makeRole({ managed: true }), 5), false);
  assert.equal(isSafeRole(makeRole({ name: "@everyone" }), 5), false);
  assert.equal(isSafeRole({ ...makeRole({ id: "55" }), guild: { id: "55" } }, 5), false);
  assert.equal(isSafeRole(makeRole({ position: 5 }), 5), false);
  assert.equal(isSafeRole(makeRole({ position: 6 }), 5), false);
  assert.equal(isSafeRole(null, 5), false);
  assert.equal(isSafeRole(makeRole({ position: 1 }), undefined), false);
});

test("isSafeRole refuses every forbidden permission, one at a time", () => {
  assert.equal(FORBIDDEN_PERMISSIONS.length, 10);
  for (const name of FORBIDDEN_PERMISSIONS) {
    const role = makeRole({ position: 1, bits: P[name] | P.SendMessages });
    assert.equal(isSafeRole(role, 5), false, name);
    assert.deepEqual(roleProblem(role, 5), { code: "dangerous", names: [name] });
  }
});

test("isSafeRole reads permissions given as a string (a role straight from an interaction)", () => {
  const role = { ...makeRole({ position: 1 }), permissions: String(P.BanMembers) };
  assert.equal(isSafeRole(role, 5), false);
  assert.equal(isSafeRole({ ...role, permissions: "0" }, 5), true);
});

test("formatWelcome fills {user} and {server} and falls back to a funny default", () => {
  assert.equal(formatWelcome("Hi {user} tại {server}", { userId: "42", serverName: "Nhà" }), "Hi <@42> tại Nhà");
  const fallback = formatWelcome("", { userId: "42", serverName: "Nhà", rng: () => 0 });
  assert.ok(fallback.includes("<@42>") && fallback.includes("Nhà"));
  assert.ok(welcomeDefaults.every((line) => line.includes("{user}") && line.includes("{server}")));
});

test("a {user} inside the server name cannot break out of the message", () => {
  const out = formatWelcome("Chào {user} ở {server}", { userId: "42", serverName: "{user} @everyone <@&9> **hi**" });
  assert.equal(out.split("<@42>").length, 2, "only the real mention is a mention");
  assert.ok(!out.includes("<@&9>"));
  assert.ok(!/@everyone/.test(out));
  assert.ok(escapeText("a_b*c").includes("\\_"));
  const post = buildWelcomePost({ message: "", verifyEnabled: false, verifyRoleId: null }, { userId: "42", serverName: "x" });
  assert.deepEqual(post.allowedMentions, { parse: [], users: ["42"] });
});

test("the verify button is only added when verification is on and a role is set", () => {
  const withButton = buildWelcomePost({ message: "", verifyEnabled: true, verifyRoleId: "123" }, { userId: "42", serverName: "x" });
  assert.equal(withButton.components[0].components[0].data.custom_id, "chaomung:verify:42");
  assert.equal(buildWelcomePost({ message: "", verifyEnabled: true, verifyRoleId: null }, { userId: "42", serverName: "x" }).components, undefined);
  assert.equal(buildWelcomePost({ message: "", verifyEnabled: false, verifyRoleId: "123" }, { userId: "42", serverName: "x" }).components, undefined);
});

test("a join with the welcome flow on gives the newbie role and posts the welcome", async () => {
  const guild = fakeGuild();
  const role = guild.addRole({ position: 2 });
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id, message: "Chào {user}", newbieRoleId: role.id });
  const result = await welcomeMember(guild, member.id);
  assert.equal(result.status, "welcomed");
  assert.equal(result.role, "given");
  assert.ok(member.roles.cache.has(role.id));
  assert.equal(guild.sent.length, 1);
  // a free server also gets the credit line under the message
  assert.equal(guild.sent[0].content, `Chào <@${member.id}>
-# Lời chào do Thầu Xây Dựng lo`);
});

test("a second welcome for the same member does not add the role again", async () => {
  const guild = fakeGuild();
  const role = guild.addRole({ position: 2 });
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id, newbieRoleId: role.id });
  await welcomeMember(guild, member.id);
  const again = await welcomeMember(guild, member.id);
  assert.equal(again.role, "already");
});

test("a disabled welcome flow does nothing", async () => {
  const guild = fakeGuild();
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: false, channelId: guild.channel.id });
  assert.deepEqual(await welcomeMember(guild, member.id), { status: "disabled" });
  assert.equal(guild.sent.length, 0);
});

test("a member who already left is skipped", async () => {
  const guild = fakeGuild();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id });
  assert.equal((await welcomeMember(guild, snowflake())).status, "gone");
  assert.equal(guild.sent.length, 0);
});

test("a deleted channel falls back to the system channel, and to nothing when there is none", async () => {
  const guild = fakeGuild({ channelInCache: false });
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id });
  const result = await welcomeMember(guild, member.id);
  assert.equal(result.status, "welcomed");
  assert.equal(guild.sent[0].viaSystem, true);

  const bare = fakeGuild({ channelInCache: false, withSystem: false });
  const other = bare.addMember();
  setSection(bare.id, "welcome", { enabled: true, channelId: bare.channel.id });
  assert.equal((await welcomeMember(bare, other.id)).status, "no-channel");
  assert.equal(bare.sent.length, 0);
});

test("missing permissions never throw: no send rights falls back, a refused role add is reported", async () => {
  const guild = fakeGuild({ canSend: false, withSystem: false });
  const role = guild.addRole({ position: 2 });
  const member = guild.addMember(undefined, { failAdd: true });
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id, newbieRoleId: role.id });
  const result = await welcomeMember(guild, member.id);
  assert.equal(result.role, "failed");
  assert.equal(result.status, "no-channel");

  const rude = fakeGuild();
  rude.channel.send = async () => {
    throw new Error("Missing Access");
  };
  const m = rude.addMember();
  setSection(rude.id, "welcome", { enabled: true, channelId: rude.channel.id });
  assert.equal((await welcomeMember(rude, m.id)).status, "send-failed");
});

test("a role that became dangerous after configuration is not handed out", async () => {
  const guild = fakeGuild();
  const role = guild.addRole({ position: 2, bits: P.BanMembers });
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id, newbieRoleId: role.id });
  assert.equal((await welcomeMember(guild, member.id)).role, "unsafe");
  assert.equal(member.roles.cache.size, 0);
  assert.equal(guild.sent.length, 1, "the welcome is still posted");
});

test("a deleted newbie role is reported as missing", async () => {
  const guild = fakeGuild();
  const member = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, channelId: guild.channel.id, newbieRoleId: snowflake() });
  assert.equal((await welcomeMember(guild, member.id)).role, "missing");
});

const joinMessage = (guild, { id = snowflake(), bot = false, type = MessageType.UserJoin, uid = snowflake() } = {}) => ({ id, type, guild, guildId: guild?.id, author: { id: uid, bot } });

test("handleJoinMessage acts only on join notices from humans, once per message id", async () => {
  const calls = [];
  const welcome = async (guild, uid) => calls.push(uid);
  const filter = createJoinFilter();
  const guild = fakeGuild();

  const first = joinMessage(guild);
  assert.equal(await handleJoinMessage(first, filter, welcome), true);
  assert.equal(await handleJoinMessage(first, filter, welcome), false, "same id twice");
  assert.equal(await handleJoinMessage(joinMessage(guild, { bot: true }), filter, welcome), false, "bot author");
  assert.equal(await handleJoinMessage(joinMessage(guild, { type: MessageType.Default }), filter, welcome), false, "ordinary message");
  assert.equal(await handleJoinMessage(joinMessage(null), filter, welcome), false, "no guild");
  assert.equal(await handleJoinMessage({ id: "1", type: MessageType.UserJoin, guild, author: null }, filter, welcome), false, "partial message");
  assert.deepEqual(calls, [first.author.id]);
});

test("a failing welcome never escapes the event handler", async () => {
  const guild = fakeGuild();
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await handleJoinMessage(joinMessage(guild), createJoinFilter(), async () => Promise.reject(new Error("boom"))), true);
  } finally {
    console.error = quiet;
  }
});

test("the event is registered for MessageCreate and ignores plain messages", async () => {
  assert.equal(messageCreate.name, "messageCreate");
  await messageCreate.execute({}, { id: "1", type: MessageType.Default, guild: null });
});

test("at most 10 welcomes per minute per server, counted with an injected clock", () => {
  let clock = 1_000_000;
  const filter = createJoinFilter({ now: () => clock });
  const guild = fakeGuild();
  const other = fakeGuild();
  const accepted = () => filter.accept(joinMessage(guild));
  for (let i = 0; i < 10; i++) assert.equal(accepted(), true, `welcome ${i + 1}`);
  assert.equal(accepted(), false, "the eleventh is dropped");
  assert.equal(filter.accept(joinMessage(other)), true, "another server has its own budget");
  clock += 59_000;
  assert.equal(accepted(), false, "still inside the window");
  clock += 1_001;
  assert.equal(accepted(), true, "the window has passed");
});

const button = (guild, { user, member } = {}) => {
  const out = { replies: [], updates: [] };
  return {
    out,
    guild,
    user: { id: user },
    member,
    reply: async (payload) => out.replies.push(payload),
    update: async (payload) => out.updates.push(payload),
  };
};

test("the verify button works for the right member: gives the role, removes the newbie role, edits the message", async () => {
  const guild = fakeGuild();
  const newbie = guild.addRole({ position: 2 });
  const verified = guild.addRole({ position: 3, name: "Đã xác minh" });
  const member = guild.addMember();
  await member.roles.add(newbie);
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: verified.id, newbieRoleId: newbie.id });
  const i = button(guild, { user: member.id });
  await chaomung.handleComponent(i, ["verify", member.id]);
  assert.ok(member.roles.cache.has(verified.id));
  assert.ok(!member.roles.cache.has(newbie.id));
  assert.equal(i.out.updates.length, 1);
  assert.deepEqual(i.out.updates[0].components, []);
  assert.match(i.out.updates[0].content, new RegExp(member.id));

  // pressing again changes nothing and still answers
  const again = button(guild, { user: member.id });
  await chaomung.handleComponent(again, ["verify", member.id]);
  assert.equal(again.out.updates.length, 1);
});

test("the verify button refuses another member and changes nothing", async () => {
  const guild = fakeGuild();
  const verified = guild.addRole({ position: 3 });
  const owner = guild.addMember();
  const stranger = guild.addMember();
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: verified.id });
  const i = button(guild, { user: stranger.id });
  await chaomung.handleComponent(i, ["verify", owner.id]);
  assert.equal(i.out.updates.length, 0);
  assert.equal(i.out.replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(owner.roles.cache.size + stranger.roles.cache.size, 0);
});

test("the verify button survives the role being removed or made dangerous meanwhile", async () => {
  const guild = fakeGuild();
  const member = guild.addMember();
  const gone = snowflake();
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: gone });
  const missing = button(guild, { user: member.id });
  await chaomung.handleComponent(missing, ["verify", member.id]);
  assert.equal(missing.out.updates.length, 0);
  assert.equal(missing.out.replies.length, 1);

  const risky = guild.addRole({ position: 3, bits: P.ManageRoles });
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: risky.id });
  const dangerous = button(guild, { user: member.id });
  await chaomung.handleComponent(dangerous, ["verify", member.id]);
  assert.equal(member.roles.cache.size, 0);
  assert.equal(dangerous.out.replies.length, 1);

  const off = fakeGuild();
  const m = off.addMember();
  setSection(off.id, "welcome", { enabled: true, verifyEnabled: false });
  const turnedOff = button(off, { user: m.id });
  await chaomung.handleComponent(turnedOff, ["verify", m.id]);
  assert.equal(turnedOff.out.replies.length, 1);
});

test("the verify button reports a refused role add without throwing", async () => {
  const guild = fakeGuild();
  const verified = guild.addRole({ position: 3 });
  const member = guild.addMember(undefined, { failAdd: true });
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: verified.id });
  const i = button(guild, { user: member.id });
  await chaomung.handleComponent(i, ["verify", member.id]);
  assert.equal(i.out.updates.length, 0);
  assert.equal(i.out.replies.length, 1);
});

// A fake slash command interaction for /chaomung
function slash(guild, sub, options = {}, { admin = true } = {}) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    user: { id: snowflake() },
    member: { permissions: { has: (flag) => admin && flag === P.Administrator } },
    options: {
      getSubcommand: () => sub,
      getChannel: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
      getString: (n) => options[n] ?? null,
      getBoolean: (n) => options[n] ?? null,
    },
    reply: async (payload) => replies.push(payload),
  };
}

test("/chaomung command JSON is valid", () => {
  const json = chaomung.data.toJSON();
  assert.equal(json.name, "chaomung");
  assert.ok(json.description.length <= 100);
  assert.deepEqual(json.options.map((o) => o.name), ["caidat", "thu", "tat"]);
  for (const sub of json.options) {
    assert.ok(sub.description.length <= 100);
    for (const o of sub.options ?? []) {
      assert.match(o.name, /^[a-z]+$/);
      assert.ok(o.description.length <= 100);
    }
  }
  assert.equal(json.options[0].options.find((o) => o.name === "tinnhan").max_length, 500);
});

test("/chaomung caidat saves the settings and says what it saved", async () => {
  const guild = fakeGuild();
  const newbie = guild.addRole({ position: 2 });
  const verified = guild.addRole({ position: 3 });
  const i = slash(guild, "caidat", { kenh: guild.channel, vaitromoi: newbie, vaitroxacminh: verified, tinnhan: "Chào {user}", xacminh: true });
  await chaomung.execute(i);
  assert.deepEqual(getSection(guild.id, "welcome"), {
    enabled: true,
    channelId: guild.channel.id,
    message: "Chào {user}",
    verifyEnabled: true,
    verifyRoleId: verified.id,
    newbieRoleId: newbie.id,
  });
  assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
  assert.match(i.replies[0].content, /Đã lưu/);
});

test("/chaomung caidat refuses unsafe roles with an explanation and stores nothing", async () => {
  const guild = fakeGuild({ botTop: 5 });
  const admin = guild.addRole({ position: 2, name: "Sếp", bits: P.Administrator });
  const high = guild.addRole({ position: 9, name: "Cao quá" });
  const bot = guild.addRole({ position: 2, name: "Bot role", managed: true });
  for (const [option, role, pattern] of [
    ["vaitromoi", admin, /Quản trị viên/],
    ["vaitroxacminh", high, /trên role cao nhất/],
    ["vaitromoi", bot, /bot/],
  ]) {
    const i = slash(guild, "caidat", { [option]: role });
    await chaomung.execute(i);
    assert.match(i.replies[0].content, pattern);
  }
  assert.equal(getSection(guild.id, "welcome").enabled, false);
});

test("/chaomung caidat will not turn verification on without a verification role, and keeps other fields", async () => {
  const guild = fakeGuild();
  const i = slash(guild, "caidat", { xacminh: true });
  await chaomung.execute(i);
  assert.match(i.replies[0].content, /vaitroxacminh/);
  assert.equal(getSection(guild.id, "welcome").enabled, false);

  const role = guild.addRole({ position: 2 });
  await chaomung.execute(slash(guild, "caidat", { vaitroxacminh: role, tinnhan: "Một" }));
  await chaomung.execute(slash(guild, "caidat", { kenh: guild.channel }));
  const saved = getSection(guild.id, "welcome");
  assert.equal(saved.message, "Một");
  assert.equal(saved.verifyRoleId, role.id);
  assert.equal(saved.channelId, guild.channel.id);
});

test("/chaomung caidat rejects a channel that cannot hold text", async () => {
  const guild = fakeGuild();
  const i = slash(guild, "caidat", { kenh: { id: snowflake(), type: ChannelType.GuildVoice } });
  await chaomung.execute(i);
  assert.match(i.replies[0].content, /Kênh này/);
});

test("/chaomung thu previews privately and /chaomung tat disables", async () => {
  const guild = fakeGuild();
  const off = slash(guild, "thu");
  await chaomung.execute(off);
  assert.match(off.replies[0].content, /đang tắt/);

  setSection(guild.id, "welcome", { enabled: true, message: "Hello {user} @ {server}" });
  const i = slash(guild, "thu");
  await chaomung.execute(i);
  assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
  assert.deepEqual(i.replies[0].allowedMentions, { parse: [] });
  assert.ok(i.replies[0].content.includes(`<@${i.user.id}>`));
  assert.equal(guild.sent.length, 0, "nothing is posted to the channel");

  const stop = slash(guild, "tat");
  await chaomung.execute(stop);
  assert.equal(getSection(guild.id, "welcome").enabled, false);
  assert.equal(stop.replies[0].flags, MessageFlags.Ephemeral);
});

test("/chaomung is for administrators and servers only", async () => {
  const guild = fakeGuild();
  const i = slash(guild, "caidat", { tinnhan: "x" }, { admin: false });
  await chaomung.execute(i);
  assert.equal(getSection(guild.id, "welcome").message, "");
  assert.ok(i.replies[0].content);

  const dm = slash(guild, "tat");
  dm.guild = null;
  dm.guildId = null;
  await chaomung.execute(dm);
  assert.equal(dm.replies.length, 1);
});
