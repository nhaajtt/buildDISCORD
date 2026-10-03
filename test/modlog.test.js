import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Collection, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "modlog-test-"));

const rules = await import("../src/modlog/rules.js");
const { addCase, listCases, countCases } = await import("../src/modlog/cases.js");
const embeds = await import("../src/modlog/embeds.js");
const handlers = await import("../src/modlog/handlers.js");
const { postModLog } = await import("../src/modlog/index.js");
const { patchSection } = await import("../src/settings.js");
const commands = Object.fromEntries(
  await Promise.all(
    ["canhcao", "timeout", "kick", "ban", "hoso"].map(async (name) => [name, (await import(`../src/commands/${name}.js`)).default]),
  ),
);

let counter = 0;
const sf = () => `8${String(++counter).padStart(17, "0")}`;
const BOT = sf();
const OWNER = sf();
const perms = (granted) => ({ has: (flag) => granted === "all" || granted.some((name) => P[name] === flag) });

// ---------- pure rules ----------

test("reasons are trimmed, capped at 300 and never blank", () => {
  assert.equal(rules.cleanReason("  spam  "), "spam");
  assert.equal(rules.cleanReason("   "), null);
  assert.equal(rules.cleanReason(null), null);
  assert.equal(rules.cleanReason(42), null);
  assert.equal(rules.cleanReason("x".repeat(900)).length, 300);
});

test("only the listed timeout lengths and 0 to 7 ban days are accepted", () => {
  assert.equal(rules.timeoutSeconds(60), 60);
  assert.equal(rules.timeoutSeconds("604800"), 604800);
  assert.equal(rules.timeoutSeconds(61), null);
  assert.equal(rules.timeoutSeconds(99999999), null);
  assert.equal(rules.banDeleteSeconds(7), 7 * 86400);
  assert.equal(rules.banDeleteSeconds(8), 0);
  assert.equal(rules.banDeleteSeconds(-1), 0);
  assert.equal(rules.banDeleteSeconds(1.5), 0);
});

test("checkTarget refuses self, bot, owner, and anyone not below both the invoker and the bot", () => {
  const base = { actorId: "a", botId: BOT, ownerId: OWNER, actorHighest: 5, botHighest: 8, targetHighest: 2, action: "kick" };
  assert.equal(rules.checkTarget({ ...base, targetId: "t" }), null);
  assert.equal(rules.checkTarget({ ...base, targetId: "a" }), "self");
  assert.equal(rules.checkTarget({ ...base, targetId: BOT }), "bot");
  assert.equal(rules.checkTarget({ ...base, targetId: OWNER }), "owner");
  assert.equal(rules.checkTarget({ ...base, targetId: "t", targetHighest: 5 }), "aboveYou");
  assert.equal(rules.checkTarget({ ...base, targetId: "t", targetHighest: 6 }), "aboveYou");
  assert.equal(rules.checkTarget({ ...base, targetId: "t", actorHighest: 9, targetHighest: 8 }), "aboveBot");
  assert.equal(rules.checkTarget({ ...base, targetId: "t", action: "timeout", targetIsAdmin: true }), "admin");
  assert.equal(rules.checkTarget({ ...base, targetId: "t", action: "kick", targetIsAdmin: true }), null);
  assert.equal(rules.checkTarget({ ...base, targetId: "t", targetHighest: null, action: "ban" }), null, "not in the server, ban by id");
  // the owner may act on anyone below the bot, whatever their own role position
  assert.equal(rules.checkTarget({ ...base, actorId: OWNER, targetId: "t", actorHighest: 0, targetHighest: 3 }), null);
});

// ---------- case rows ----------

test("cases are stored and listed newest first, per server and person", () => {
  const g = sf();
  const u = sf();
  const ids = [10, 20, 30].map((at, i) => addCase({ guildId: g, userId: u, modId: "m", action: ["warn", "timeout", "ban"][i], reason: `r${i}`, at }));
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(listCases(g, u).map((c) => c.reason), ["r2", "r1", "r0"]);
  assert.deepEqual(listCases(sf(), u), []);
  assert.equal(countCases(g, u), 3);
  assert.throws(() => addCase({ guildId: g, userId: u, modId: "m", action: "explode" }));
  assert.equal(listCases(g, u, 2).length, 2);
});

// ---------- fakes ----------

function fakeMember({ id = sf(), top = 1, admin = false, fail = false } = {}) {
  const calls = [];
  return {
    id,
    calls,
    permissions: perms(admin ? "all" : []),
    roles: { highest: { position: top } },
    timeout: async (ms, reason) => {
      if (fail) throw new Error("Missing Permissions");
      calls.push(["timeout", ms, reason]);
    },
    kick: async (reason) => {
      if (fail) throw new Error("Missing Permissions");
      calls.push(["kick", reason]);
    },
  };
}

function fakeUser(id = sf(), { dmFails = false } = {}) {
  const dms = [];
  return {
    id,
    dms,
    send: async (payload) => {
      if (dmFails) throw new Error("Cannot send messages to this user");
      dms.push(payload);
    },
  };
}

function fakeGuild({ botPerms = "all", botTop = 10, logChannel = true } = {}) {
  const id = sf();
  const logSent = [];
  const channelId = sf();
  const channels = new Collection();
  if (logChannel) channels.set(channelId, { id: channelId, send: async (p) => logSent.push(p), permissionsFor: () => perms("all") });
  const bans = [];
  return {
    id,
    name: "Server Thử",
    ownerId: OWNER,
    logSent,
    channelId,
    bans,
    channels: { cache: channels },
    members: {
      me: { id: BOT, permissions: perms(botPerms), roles: { highest: { position: botTop } } },
      ban: async (uid, opts) => {
        bans.push([uid, opts]);
      },
    },
  };
}

function interaction({ guild, action, invokerPerms = "all", invokerTop = 5, invokerId = sf(), target, member, options = {} }) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild?.id,
    user: { id: invokerId },
    member: { id: invokerId, permissions: perms(invokerPerms), roles: { highest: { position: invokerTop } } },
    options: {
      getUser: () => target ?? null,
      getMember: () => member ?? null,
      getString: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
    },
    reply: async (p) => replies.push(p),
  };
}

const enableLog = (guild) => patchSection(guild.id, "modlog", { enabled: true, channelId: guild.channelId });

// ---------- commands: permissions and hierarchy ----------

test("every moderation command asks Discord for exactly its own permission", () => {
  assert.equal(commands.canhcao.data.default_member_permissions, String(P.ModerateMembers));
  assert.equal(commands.timeout.data.default_member_permissions, String(P.ModerateMembers));
  assert.equal(commands.kick.data.default_member_permissions, String(P.KickMembers));
  assert.equal(commands.ban.data.default_member_permissions, String(P.BanMembers));
  assert.equal(commands.hoso.data.default_member_permissions, String(P.ModerateMembers));
  const json = commands.timeout.data.toJSON();
  assert.deepEqual(json.options.find((o) => o.name === "thoigian").choices.map((c) => c.value), [60, 300, 3600, 86400, 604800]);
  const reasonOpt = commands.ban.data.toJSON().options.find((o) => o.name === "lydo");
  assert.equal(reasonOpt.max_length, 300);
  const days = commands.ban.data.toJSON().options.find((o) => o.name === "xoatin");
  assert.deepEqual([days.min_value, days.max_value], [0, 7]);
});

const ACTIONS = [
  ["canhcao", "ModerateMembers", {}],
  ["timeout", "ModerateMembers", { thoigian: 60 }],
  ["kick", "KickMembers", {}],
  ["ban", "BanMembers", {}],
];

test("someone without the matching permission is refused and nothing changes", async () => {
  for (const [name, need, extra] of ACTIONS) {
    const guild = fakeGuild();
    const target = fakeUser();
    const member = fakeMember({ id: target.id });
    const others = ["ModerateMembers", "KickMembers", "BanMembers"].filter((p) => p !== need);
    const i = interaction({ guild, target, member, invokerPerms: others, options: { lydo: "vì sao không", ...extra } });
    await commands[name].execute(i);
    assert.match(i.replies[0].content, /thiếu quyền/);
    assert.equal(i.replies[0].flags !== undefined, true);
    assert.deepEqual(member.calls, []);
    assert.deepEqual(guild.bans, []);
    assert.deepEqual(target.dms, []);
    assert.equal(countCases(guild.id, target.id), 0);
  }
});

test("the bot itself must hold the permission", async () => {
  for (const [name, need, extra] of ACTIONS) {
    const guild = fakeGuild({ botPerms: [] });
    const target = fakeUser();
    const member = fakeMember({ id: target.id });
    const i = interaction({ guild, target, member, options: { lydo: "lý do", ...extra } });
    await commands[name].execute(i);
    assert.match(i.replies[0].content, /Thầu thiếu quyền/);
    assert.equal(countCases(guild.id, target.id), 0);
    assert.ok(need);
  }
});

test("self, the bot, the owner and people above are refused for every action", async () => {
  for (const [name, , extra] of ACTIONS) {
    const guild = fakeGuild({ botTop: 10 });
    const invokerId = sf();
    const cases = [
      ["self", fakeUser(invokerId), fakeMember({ id: invokerId, top: 1 }), /Tự xử/],
      ["bot", fakeUser(BOT), fakeMember({ id: BOT, top: 1 }), /Xử thầu/],
      ["owner", fakeUser(OWNER), fakeMember({ id: OWNER, top: 1 }), /chủ server/],
      ["above you", fakeUser(), fakeMember({ top: 6 }), /ngang hoặc cao hơn bạn/],
      ["equal", fakeUser(), fakeMember({ top: 5 }), /ngang hoặc cao hơn bạn/],
    ];
    for (const [label, target, member, pattern] of cases) {
      const i = interaction({ guild, invokerId, invokerTop: 5, target, member: member && { ...member, id: target.id }, options: { lydo: "lý do", ...extra } });
      await commands[name].execute(i);
      assert.match(i.replies[0].content, pattern, `${name} ${label}`);
      assert.deepEqual(member.calls, [], `${name} ${label}`);
      assert.deepEqual(guild.bans, []);
      assert.equal(countCases(guild.id, target.id), 0);
    }
  }
});

test("a target at or above the bot is refused even when the invoker is higher", async () => {
  const guild = fakeGuild({ botTop: 4 });
  const target = fakeUser();
  const member = fakeMember({ id: target.id, top: 4 });
  const i = interaction({ guild, target, member, invokerTop: 9, options: { lydo: "lý do" } });
  await commands.kick.execute(i);
  assert.match(i.replies[0].content, /thầu với không tới/);
  assert.deepEqual(member.calls, []);
});

test("an administrator cannot be timed out, and the owner may act below the bot", async () => {
  const guild = fakeGuild();
  const target = fakeUser();
  const adminMember = fakeMember({ id: target.id, top: 2, admin: true });
  const i = interaction({ guild, target, member: adminMember, options: { lydo: "lý do", thoigian: 60 } });
  await commands.timeout.execute(i);
  assert.match(i.replies[0].content, /Administrator/);

  const lowOwner = interaction({ guild, invokerId: OWNER, invokerTop: 0, target, member: fakeMember({ id: target.id, top: 3 }), options: { lydo: "lý do" } });
  await commands.kick.execute(lowOwner);
  assert.match(lowOwner.replies[0].content, /đuổi/);
});

test("kick, timeout and warn need the person to be in the server, ban does not", async () => {
  for (const [name, , extra] of ACTIONS.slice(0, 3)) {
    const guild = fakeGuild();
    const i = interaction({ guild, target: fakeUser(), member: null, options: { lydo: "lý do", ...extra } });
    await commands[name].execute(i);
    assert.match(i.replies[0].content, /không có trong server/);
  }
  const guild = fakeGuild();
  const target = fakeUser();
  const i = interaction({ guild, target, member: null, options: { lydo: "lý do" } });
  await commands.ban.execute(i);
  assert.equal(guild.bans.length, 1);
  assert.equal(guild.bans[0][0], target.id);
});

// ---------- commands: happy paths ----------

test("warn stores a case, sends a DM and posts to the mod log", async () => {
  const guild = fakeGuild();
  enableLog(guild);
  const target = fakeUser();
  const i = interaction({ guild, target, member: fakeMember({ id: target.id }), options: { lydo: "  nói tục  " } });
  await commands.canhcao.execute(i);
  assert.match(i.replies[0].content, /hồ sơ #/);
  assert.deepEqual(i.replies[0].allowedMentions, { parse: [] });
  const rows = listCases(guild.id, target.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "warn");
  assert.equal(rows[0].reason, "nói tục");
  assert.equal(rows[0].mod_id, i.user.id);
  assert.equal(target.dms.length, 1);
  assert.match(target.dms[0].content, /nói tục/);
  assert.equal(guild.logSent.length, 1);
  const logged = guild.logSent[0].embeds[0].toJSON();
  assert.match(logged.title, new RegExp(`#${rows[0].id}`));
  assert.deepEqual(guild.logSent[0].allowedMentions, { parse: [] });
});

test("timeout applies the chosen length and records when it ends", async () => {
  const guild = fakeGuild();
  const target = fakeUser();
  const member = fakeMember({ id: target.id });
  const before = Date.now();
  const i = interaction({ guild, target, member, options: { lydo: "ồn quá", thoigian: 3600 } });
  await commands.timeout.execute(i);
  assert.equal(member.calls[0][0], "timeout");
  assert.equal(member.calls[0][1], 3_600_000);
  const row = listCases(guild.id, target.id)[0];
  assert.equal(row.action, "timeout");
  assert.ok(row.until >= before + 3_600_000 && row.until <= Date.now() + 3_600_000);
  assert.equal(target.dms.length, 1);
});

test("timeout refuses a length that is not on the list", async () => {
  const guild = fakeGuild();
  const target = fakeUser();
  const member = fakeMember({ id: target.id });
  for (const bad of [0, 1, 61, 2_419_200, -5, "abc", null]) {
    const i = interaction({ guild, target, member, options: { lydo: "lý do", thoigian: bad } });
    await commands.timeout.execute(i);
    assert.deepEqual(member.calls, []);
  }
  assert.equal(countCases(guild.id, target.id), 0);
});

test("kick and ban act, notify first and store cases", async () => {
  const guild = fakeGuild();
  const target = fakeUser();
  const member = fakeMember({ id: target.id });
  await commands.kick.execute(interaction({ guild, target, member, options: { lydo: "đi đi" } }));
  assert.equal(member.calls[0][0], "kick");
  assert.equal(target.dms.length, 1);

  const banned = fakeUser();
  const bm = fakeMember({ id: banned.id });
  await commands.ban.execute(interaction({ guild, target: banned, member: bm, options: { lydo: "phá", xoatin: 3 } }));
  assert.equal(guild.bans[0][1].deleteMessageSeconds, 3 * 86400);
  assert.ok(guild.bans[0][1].reason.includes("phá"));
  assert.equal(listCases(guild.id, banned.id)[0].action, "ban");

  const other = fakeUser();
  await commands.ban.execute(interaction({ guild, target: other, member: fakeMember({ id: other.id }), options: { lydo: "phá", xoatin: 99 } }));
  assert.equal(guild.bans[1][1].deleteMessageSeconds, 0, "an out of range day count removes nothing");
});

test("a failed DM is ignored and a failed action stores no case", async () => {
  const guild = fakeGuild();
  const target = fakeUser(sf(), { dmFails: true });
  const i = interaction({ guild, target, member: fakeMember({ id: target.id }), options: { lydo: "lý do" } });
  await commands.canhcao.execute(i);
  assert.match(i.replies[0].content, /hồ sơ #/);
  assert.equal(countCases(guild.id, target.id), 1);

  const victim = fakeUser();
  const broken = fakeMember({ id: victim.id, fail: true });
  const j = interaction({ guild, target: victim, member: broken, options: { lydo: "lý do" } });
  await commands.kick.execute(j);
  assert.match(j.replies[0].content, /không cho thầu/);
  assert.equal(countCases(guild.id, victim.id), 0);
});

test("hostile reasons are blanked or cut, and never ping", async () => {
  const guild = fakeGuild();
  const target = fakeUser();
  const member = fakeMember({ id: target.id });
  const blank = interaction({ guild, target, member, options: { lydo: "   \r\n  " } });
  await commands.canhcao.execute(blank);
  assert.match(blank.replies[0].content, /Lý do trống/);
  assert.equal(countCases(guild.id, target.id), 0);

  const long = interaction({ guild, target, member, options: { lydo: `@everyone ${"x".repeat(1000)}` } });
  await commands.canhcao.execute(long);
  assert.equal(listCases(guild.id, target.id)[0].reason.length, 300);
  assert.deepEqual(long.replies[0].allowedMentions, { parse: [] });
  assert.deepEqual(target.dms[0].allowedMentions, { parse: [] });
});

test("moderation commands refuse to run outside a server", async () => {
  for (const [name] of ACTIONS) {
    const i = interaction({ guild: null, target: fakeUser(), options: { lydo: "lý do" } });
    await commands[name].execute(i);
    assert.match(i.replies[0].content, /chỉ chạy trong server/);
  }
});

// ---------- /hoso ----------

test("/hoso shows the last 10 cases and needs ModerateMembers", async () => {
  const guild = fakeGuild();
  const u = sf();
  for (let n = 1; n <= 12; n++) addCase({ guildId: guild.id, userId: u, modId: "123456789012345678", action: "warn", reason: `lý do ${n}`, at: n * 1000 });
  addCase({ guildId: sf(), userId: u, modId: "m", action: "ban", reason: "ở server khác", at: 99_000 });

  const denied = interaction({ guild, invokerPerms: ["KickMembers"], target: fakeUser(u) });
  await commands.hoso.execute(denied);
  assert.match(denied.replies[0].content, /thiếu quyền/);

  const i = interaction({ guild, target: fakeUser(u) });
  await commands.hoso.execute(i);
  const embed = i.replies[0].embeds[0].toJSON();
  const lines = embed.description.split("\n").slice(1);
  assert.equal(lines.length, 10);
  assert.match(lines[0], /lý do 12/);
  assert.ok(!embed.description.includes("server khác"));
  assert.match(embed.footer.text, /10 trên 12/);
  assert.deepEqual(i.replies[0].allowedMentions, { parse: [] });

  const clean = interaction({ guild, target: fakeUser() });
  await commands.hoso.execute(clean);
  assert.match(clean.replies[0].content, /sạch bong/);
});

// ---------- mod log events ----------

const SECRET = "mật khẩu của tôi là hunter2 và đây là tin nhắn riêng";

test("an AutoMod block is logged with rule, person and channel but never the message", async () => {
  const guild = fakeGuild();
  enableLog(guild);
  const userId = sf();
  const channelId = sf();
  const execution = {
    guild,
    userId,
    channelId,
    ruleTriggerType: 1,
    autoModerationRule: { name: "Chặn link" },
    content: SECRET,
    matchedContent: SECRET,
    matchedKeyword: "hunter2",
    messageId: sf(),
    alertSystemMessageId: sf(),
  };
  assert.equal(await handlers.logAutomod(execution), true);
  const json = JSON.stringify(guild.logSent[0].embeds[0].toJSON());
  assert.ok(json.includes("Chặn link"));
  assert.ok(json.includes(userId));
  assert.ok(json.includes(channelId));
  for (const leak of [SECRET, "hunter2", "mật khẩu"]) assert.ok(!json.includes(leak), `leaked: ${leak}`);
});

test("embed builders read only the fields they name", () => {
  const built = embeds.automodEmbed({ ruleName: "Luật", ruleTriggerType: 3, userId: sf(), channelId: sf(), content: SECRET, matchedContent: SECRET });
  assert.ok(!JSON.stringify(built.toJSON()).includes("hunter2"));
  const ban = embeds.banEmbed({ userId: sf(), reason: "r", content: SECRET });
  assert.ok(!JSON.stringify(ban.toJSON()).includes("hunter2"));
  const c = embeds.caseEmbed({ id: 1, action: "warn", user_id: sf(), mod_id: sf(), reason: "x".repeat(900), content: SECRET });
  const json = c.toJSON();
  assert.ok(!JSON.stringify(json).includes("hunter2"));
  assert.ok(json.fields.find((f) => f.name === "Lý do").value.length <= 300);
});

test("bans and unbans are logged, and a ban the bot made is not logged twice", async () => {
  const guild = fakeGuild();
  enableLog(guild);
  const stranger = sf();
  assert.equal(await handlers.logBan({ guild, user: { id: stranger }, reason: "tự ý" }), true);
  assert.equal(await handlers.logUnban({ guild, user: { id: stranger } }), true);
  assert.equal(guild.logSent.length, 2);

  const target = fakeUser();
  await commands.ban.execute(interaction({ guild, target, member: fakeMember({ id: target.id }), options: { lydo: "lý do" } }));
  const afterCommand = guild.logSent.length;
  assert.equal(afterCommand, 3, "the command logged its own case");
  assert.equal(await handlers.logBan({ guild, user: { id: target.id }, reason: "lý do" }), false);
  assert.equal(guild.logSent.length, afterCommand);
});

test("role permission changes list exactly what was added and removed", async () => {
  const guild = fakeGuild();
  enableLog(guild);
  const make = (bits) => ({ id: sf(), name: "Mod", guild, permissions: { bitfield: bits } });
  const oldRole = make(P.SendMessages | P.BanMembers);
  const newRole = { ...oldRole, permissions: { bitfield: P.SendMessages | P.ManageGuild } };
  assert.equal(await handlers.logRoleUpdate(oldRole, newRole), true);
  const fields = guild.logSent[0].embeds[0].toJSON().fields;
  assert.equal(fields.find((f) => f.name === "Được thêm").value, "ManageGuild");
  assert.equal(fields.find((f) => f.name === "Bị bỏ").value, "BanMembers");

  assert.equal(await handlers.logRoleUpdate(oldRole, { ...oldRole, name: "Đổi tên" }), false, "a rename is not a permission change");
  assert.deepEqual(embeds.diffPermissions(0n, new PermissionsBitField(P.Administrator).bitfield).added, ["Administrator"]);
});

test("nothing is logged when the log is off, the switch is off, or the bot cannot post", async () => {
  const guild = fakeGuild();
  const ban = { guild, user: { id: sf() }, reason: null };
  assert.equal(await handlers.logBan(ban), false, "off by default");

  enableLog(guild);
  patchSection(guild.id, "modlog", { logBans: false, logRoles: false, logAutomod: false });
  assert.equal(await handlers.logBan({ ...ban, user: { id: sf() } }), false);
  assert.equal(await handlers.logAutomod({ guild, userId: sf(), channelId: sf(), ruleTriggerType: 1 }), false);

  patchSection(guild.id, "modlog", { logBans: true });
  guild.channels.cache.get(guild.channelId).permissionsFor = () => perms(["ViewChannel"]);
  assert.equal(await handlers.logBan({ ...ban, user: { id: sf() } }), false);

  const noChannel = fakeGuild({ logChannel: false });
  enableLog(noChannel);
  assert.equal(await postModLog(noChannel, embeds.banEmbed({ userId: sf() }), "ban"), false);
  assert.equal(await handlers.logBan({ guild: undefined, user: { id: "1" } }), false);
});

test("a log channel that errors does not break the caller", async () => {
  const guild = fakeGuild();
  enableLog(guild);
  guild.channels.cache.get(guild.channelId).send = async () => {
    throw new Error("Missing Access");
  };
  assert.equal(await handlers.logBan({ guild, user: { id: sf() }, reason: "x" }), false);
  const target = fakeUser();
  const i = interaction({ guild, target, member: fakeMember({ id: target.id }), options: { lydo: "lý do" } });
  await commands.canhcao.execute(i);
  assert.match(i.replies[0].content, /hồ sơ #/);
});
