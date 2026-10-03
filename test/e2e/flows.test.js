import { test, after } from "node:test";
import assert from "node:assert/strict";
import { ChannelType, createGateway, customIdsOf, componentsOf, effectiveOverwrites, overwriteMap, textOf } from "./gateway.js";

const gw = await createGateway({ env: { STRIPE_SECRET_KEY: "sk_test_e2e", PAYOS_CLIENT_ID: null, PAYOS_API_KEY: null, PAYOS_CHECKSUM_KEY: null, UNLOCKED_GUILD_IDS: null, OWNER_IDS: null } });
after(() => gw.close());

const { getSection, patchSection } = await import("../../src/settings.js");
const { getPlan, getUsage, grant } = await import("../../src/license.js");
const { getDb } = await import("../../src/db.js");
const { loadRecord } = await import("../../src/store.js");

const pro = (guild, days = 30) => grant(guild.id, "pro", days, gw.clock.now());
const fieldsOf = (payload) => Object.fromEntries((payload.embeds ?? []).flatMap((e) => e.fields ?? []).map((f) => [f.name, f.value]));
const scoreIn = (text) => Number(/\*\*(\d+)\/100\*\*/.exec(text)?.[1]);

// ---------------------------------------------------------------- (a) the first ten minutes

test("(a) the bot joins, welcomes, the wizard builds the server, and running it again duplicates nothing", async () => {
  const guild = gw.createGuild({ attach: false });
  const admin = guild.members.cache.get(guild.ownerId);
  const stranger = gw.addPerson(guild, "khach");

  await gw.botJoins(guild);
  const welcomes = gw.sentTo(guild.systemChannel);
  assert.equal(welcomes.length, 1, "one welcome message in the system channel");
  assert.deepEqual(customIdsOf(welcomes[0].payload), ["batdau:open"]);
  assert.match(textOf(welcomes[0].payload), /Bắt đầu/);

  // a member without Administrator is refused, and nothing is opened for them
  const refused = await gw.click("batdau:open", { member: stranger, channel: guild.systemChannel });
  assert.equal(componentsOf(refused.last).length, 0);
  assert.ok(refused.last.content.length > 0);

  const opened = await gw.click("batdau:open", { member: admin, channel: guild.systemChannel });
  const ids = customIdsOf(opened.finalPayload);
  assert.deepEqual(ids, [`batdau:theme:${admin.id}`, `batdau:humor:${admin.id}`, `batdau:extras:${admin.id}`, `batdau:go:${admin.id}`, `batdau:no:${admin.id}`]);
  await assert.rejects(() => gw.click(`batdau:go:${admin.id}`, { member: admin }), /disabled/, "the build button waits for a theme");

  const picked = await gw.select(`batdau:theme:${admin.id}`, ["gaming"], { member: admin });
  assert.match(textOf(picked.finalPayload), /Kiểu server:\*\* .*[Gg]a/);
  assert.equal(componentsOf(picked.finalPayload).find((c) => c.custom_id === `batdau:go:${admin.id}`).disabled, false);

  const before = gw.mark();
  const built = await gw.click(`batdau:go:${admin.id}`, { member: admin });
  const card = fieldsOf(built.finalPayload);
  assert.ok(Object.keys(card).length >= 4, "the result card has score and setup fields");
  const scores = Object.values(card).filter((v) => /\/100/.test(v)).map(scoreIn);
  assert.equal(scores.length, 2);
  assert.ok(scores[1] > scores[0], `the health score rose (${scores[0]} to ${scores[1]})`);
  assert.ok(gw.since(before).some((r) => r.kind === "update" && /Đang|đang|\.\.\./.test(textOf(r.payload)) || r.kind === "editReply"), "progress was shown while building");

  const record = loadRecord(guild.id);
  assert.ok(record.channels.length >= 10 && record.roles.length >= 5 && record.categories.length >= 3, "the server was built");
  for (const id of record.channels) assert.ok(guild.channels.cache.has(id));
  const setup = getSection(guild.id, "setup");
  assert.equal(setup.done, true);
  assert.equal(setup.themeIds, "gaming");
  assert.equal(getSection(guild.id, "welcome").enabled, true, "welcome switched on");
  assert.equal(getSection(guild.id, "automod").enabled, true);
  assert.ok(guild.automodRules.size > 0, "AutoMod rules exist on the server");
  assert.equal(getSection(guild.id, "security").raidEnabled, true);
  assert.ok(getSection(guild.id, "security").alertChannelId, "alerts are wired to a channel");
  assert.ok(getSection(guild.id, "modlog").channelId);
  assert.equal(getUsage(guild.id, "build", { lifetime: true }), 1);

  // the channels the builder fills have their content, and the role buttons work for a normal member
  const rules = gw.sentTo(guild.channelNamed("luat") ?? guild.channelNamed("rules") ?? guild.systemChannel);
  assert.ok(rules.length >= 1);
  const rolesChannel = guild.channels.cache.get(record.channels.find((id) => gw.sentTo(guild.channels.cache.get(id), (r) => customIdsOf(r.payload).some((c) => c.startsWith("pickrole:"))).length));
  assert.ok(rolesChannel, "the role channel carries pickrole buttons");
  const pick = customIdsOf(gw.sentTo(rolesChannel)[0].payload)[0];
  const pressed = await gw.click(pick, { member: stranger, channel: rolesChannel });
  assert.equal(gw.find("roleAdd", (r) => r.userId === stranger.id).length, 1);
  assert.match(pressed.text, /role/i);

  // the second run through the same menus
  const counts = () => ({ channels: guild.channels.cache.size, roles: guild.roles.cache.size, rules: guild.automodRules.size });
  const first = counts();
  const mark2 = gw.mark();
  const again = await gw.slash("batdau", { guild, member: admin, channel: guild.systemChannel });
  await gw.select(`batdau:theme:${admin.id}`, ["gaming"], { member: admin });
  const second = await gw.click(`batdau:go:${admin.id}`, { member: admin });
  assert.deepEqual(counts(), first, "nothing was duplicated");
  const delta = gw.since(mark2);
  assert.equal(delta.filter((r) => ["channelCreate", "roleCreate", "automodCreate"].includes(r.kind)).length, 0);
  assert.equal(delta.filter((r) => r.kind === "send").length, 0, "no second copy of the rules, welcome or role messages");
  assert.equal(getUsage(guild.id, "build", { lifetime: true }), 1, "the repeat run did not use up another build");
  assert.ok(second.finalPayload.embeds.length === 1);
  assert.ok(again.finalPayload.embeds.length === 1);
});

// ---------------------------------------------------------------- (b) anti-raid

const { PermissionFlagsBits: P, Events } = await import("discord.js");
const { securityLines } = await import("../../src/humor/security.js");

function raidGuild() {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const alerts = guild.addChannel({ name: "canh-bao" });
  const staff = guild.addRole({ name: "Staff", permissions: 0n, position: 10 });
  guild.addChannel({ name: "thong-bao", overwrites: [{ id: guild.id, deny: [P.SendMessages] }] });
  guild.addChannel({ name: "chat-tu-do", overwrites: [{ id: guild.id, allow: [P.SendMessages] }] });
  guild.addChannel({ name: "nhan-vien", overwrites: [{ id: guild.id, deny: [P.ViewChannel] }, { id: staff.id, allow: [P.ViewChannel, P.SendMessages] }] });
  guild.addChannel({ name: "phong-voice", type: ChannelType.GuildVoice });
  return { guild, admin, alerts };
}

test("(b) a burst of joins trips anti-raid, the alert is posted, channels lock, and the unlock button restores the overwrites", async () => {
  const { guild, admin, alerts } = raidGuild();
  const stranger = gw.addPerson(guild, "khach");
  const before = overwriteMap(guild);
  await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { raid: true, solan: 3, giay: 60, hanhdong: "lock", kenh: alerts } });
  assert.equal(getSection(guild.id, "security").raidEnabled, true);

  // the same notice delivered twice counts once, and bots are not counted
  const first = await gw.join(guild, { name: "ke-1" });
  await gw.emit(Events.MessageCreate, first.message);
  await gw.join(guild, { name: "bot-vao", bot: true });
  await gw.join(guild, { name: "ke-2" });
  assert.equal(gw.sentTo(alerts).length, 0, "two real joins are below the threshold of three");
  assert.equal(gw.find("overwrite", (r) => r.guildId === guild.id).length, 0);

  await gw.join(guild, { name: "ke-3" });
  const posted = gw.sentTo(alerts);
  assert.equal(posted.length, 1, "one alert");
  assert.equal(posted[0].payload.embeds[0].title, securityLines.raidTitle);
  assert.deepEqual(customIdsOf(posted[0].payload), ["khoakhan:unlock"]);

  const edited = new Set(gw.find("overwrite", (r) => r.guildId === guild.id).map((r) => r.channelId));
  const expected = ["general", "canh-bao", "chat-tu-do"].map((n) => guild.channelNamed(n).id);
  assert.deepEqual([...edited].sort(), expected.sort(), "only the channels where everyone could write were locked");
  assert.equal(guild.channelNamed("general").permissionsFor(stranger).has(P.SendMessages), false);
  assert.equal(guild.channelNamed("general").permissionsFor(admin).has(P.SendMessages), true);
  assert.equal(getSection(guild.id, "security").lockdown.active, true);

  // a second burst while locked is one raid, not two alerts
  for (const n of ["ke-4", "ke-5", "ke-6"]) await gw.join(guild, { name: n });
  assert.equal(gw.sentTo(alerts).length, 1);

  // only an administrator can unlock
  const refused = await gw.click("khoakhan:unlock", { member: stranger, channel: alerts });
  assert.equal(getSection(guild.id, "security").lockdown.active, true);
  assert.ok(refused.text.length > 0);

  const marked = gw.mark();
  const unlocked = await gw.click("khoakhan:unlock", { member: admin, channel: alerts });
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
  assert.deepEqual(overwriteMap(guild), before, "every channel has exactly the overwrites it had before");
  assert.equal(guild.channelNamed("chat-tu-do").permissionOverwrites.cache.get(guild.id).allow.has(P.SendMessages), true, "the explicit allow came back");
  assert.ok(gw.since(marked).some((r) => r.kind === "messageEdit" && customIdsOf(r.payload).length === 0), "the alert lost its button");
  assert.match(unlocked.text, /\d/);
  await assert.rejects(() => gw.click("khoakhan:unlock", { member: admin, channel: alerts }), /No button|disabled/);
  const again = await gw.slash("khoakhan", { guild, member: admin, sub: "tat" });
  assert.equal(again.text, securityLines.notLocked);
});

test("(b) a raid with the verify action raises the verification level and the lockdown job lifts it on time", async () => {
  const { guild, admin, alerts } = raidGuild();
  const before = overwriteMap(guild);
  await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { raid: true, solan: 3, giay: 30, hanhdong: "verify", phut: 5, kenh: alerts } });
  for (const n of ["a", "b", "c"]) await gw.join(guild, { name: n });
  const raised = gw.find("verification", (r) => r.guildId === guild.id);
  assert.equal(raised.length, 1);
  assert.deepEqual([raised[0].from, raised[0].to], [0, 1]);
  assert.equal(guild.verificationLevel, 1);
  assert.equal(gw.find("overwrite", (r) => r.guildId === guild.id).length, 0, "verify does not touch channels");
  assert.equal(gw.sentTo(alerts).length, 1);
  assert.ok(customIdsOf(gw.sentTo(alerts)[0].payload).includes("khoakhan:unlock"));

  await gw.advance(4 * 60_000);
  await gw.runJob("lockdown");
  assert.equal(guild.verificationLevel, 1, "not yet");
  await gw.advance(61_000);
  assert.equal(await gw.runJob("lockdown"), 1);
  assert.equal(guild.verificationLevel, 0, "the previous level is back");
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
  assert.deepEqual(overwriteMap(guild), before);
  assert.equal(gw.sentTo(alerts).length, 2, "the automatic unlock is announced");
  assert.equal(await gw.runJob("lockdown"), 0, "and happens once");
});

test("(b) a verification level changed by hand during the lock is left alone on unlock", async () => {
  const { guild, admin, alerts } = raidGuild();
  await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { raid: true, solan: 3, giay: 30, hanhdong: "verify", kenh: alerts } });
  for (const n of ["a", "b", "c"]) await gw.join(guild, { name: n });
  guild.verificationLevel = 3;
  const unlocked = await gw.click("khoakhan:unlock", { member: admin, channel: alerts });
  assert.equal(guild.verificationLevel, 3);
  assert.ok(unlocked.text.length > 0);
});

// ---------------------------------------------------------------- (c) anti-nuke

const { buildServer } = await import("../../src/builder.js");

test("(c) mass deletion by one executor trips the nuke guard, the owner and the bot are ignored", async () => {
  const guild = gw.createGuild();
  pro(guild);
  const owner = guild.members.cache.get(guild.ownerId);
  const admin = gw.addAdmin(guild);
  const alerts = guild.addChannel({ name: "canh-bao" });
  const rogueRole = guild.addRole({ name: "Tay to", permissions: P.ManageChannels | P.KickMembers, position: 400 });
  const harmless = guild.addRole({ name: "Vui vẻ", permissions: 0n, position: 300 });
  const rogue = guild.addMember({ name: "rogue", roles: [rogueRole, harmless] });
  const calm = guild.addMember({ name: "calm", roles: [rogueRole] });
  const second = guild.addMember({ name: "rogue2", roles: [rogueRole] });
  const make = (n, prefix) => Array.from({ length: n }, (_, i) => guild.addChannel({ name: `${prefix}-${i}` }));
  const roleOf = (n, prefix) => Array.from({ length: n }, (_, i) => guild.addRole({ name: `${prefix}-${i}`, permissions: 0n, position: 5 }));

  await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { chongxoa: true, xoasolan: 3, xoagiay: 60, kenh: alerts } });
  assert.equal(getSection(guild.id, "security").nukeEnabled, true);

  // the bot builds and then tears down a whole server with /nuke, while the owner deletes five channels, a member removes
  // three integration roles (which vanish with their bots) and another member deletes two channels, under the threshold
  await buildServer(guild, "gaming");
  const built = loadRecord(guild.id);
  const botDeletes = built.channels.length + built.categories.length + built.roles.length;
  const ownerChannels = make(5, "o");
  const integrations = [1, 2, 3].map((n) => guild.addRole({ name: `Bot cu ${n}`, permissions: P.Administrator, position: 6, managed: true }));
  const calmChannels = make(2, "c");
  const marker = gw.mark();
  await Promise.all([
    (async () => {
      await gw.slash("nuke", { guild, member: admin, channel: alerts });
      await gw.click(`nuke:go:${admin.id}`, { member: admin, channel: alerts });
    })(),
    Promise.all(ownerChannels.map((c) => gw.deleteChannel(c, { by: owner }))),
    Promise.all(integrations.map((r) => gw.deleteRole(r, { by: calm }))),
    Promise.all(calmChannels.map((c) => gw.deleteChannel(c, { by: calm }))),
  ]);
  const gone = gw.since(marker).filter((r) => r.kind === "channelDelete" || r.kind === "roleDelete");
  assert.ok(gone.filter((r) => r.executorId === gw.botId).length === botDeletes, "the bot really did delete the server it built");
  assert.equal(gw.sentTo(alerts).filter((r) => r.payload.embeds?.some((e) => e.title === securityLines.nukeTitle)).length, 0, "no alert for the owner, the bot, a managed role or two deletions");
  assert.equal(gw.find("roleRemove", (r) => r.guildId === guild.id).length, 0, "nobody lost a role");

  // one member deletes three channels
  const victims = make(3, "v");
  await Promise.all(victims.map((c) => gw.deleteChannel(c, { by: rogue })));
  const nukeAlerts = () => gw.sentTo(alerts).filter((r) => r.payload.embeds?.some((e) => e.title === securityLines.nukeTitle));
  assert.equal(nukeAlerts().length, 1, "one alert");
  assert.ok(textOf(nukeAlerts()[0].payload).includes(rogue.id), "naming the member");
  const removed = gw.find("roleRemove", (r) => r.guildId === guild.id);
  assert.deepEqual(removed.map((r) => r.roleId), [rogueRole.id], "only the dangerous role was taken");
  assert.equal(rogue.roles.cache.has(rogueRole.id), false);
  assert.equal(rogue.roles.cache.has(harmless.id), true, "the harmless role stayed");
  assert.equal(calm.roles.cache.has(rogueRole.id), true, "the member who stayed under the threshold keeps theirs");

  // and the same for roles
  const doomed = roleOf(3, "d");
  await Promise.all(doomed.map((r) => gw.deleteRole(r, { by: second })));
  assert.equal(nukeAlerts().length, 2);
  assert.ok(textOf(nukeAlerts()[1].payload).includes(second.id));
  assert.equal(second.roles.cache.has(rogueRole.id), false);
});

// ---------------------------------------------------------------- (d) activity: chat and voice xp

const activityLines = (await import("../../src/humor/activity.js")).lines;
const { levelUp: levelUpLine } = await import("../../src/humor/activity.js");
const { getStats } = await import("../../src/activity/xp.js");
const DAY = 86_400_000;

const rankCard = (i) => fieldsOf(i.last);

test("(d) chat and voice grant xp with a cooldown and a daily cap, a level role is granted, and /hang shows it", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const announce = guild.addChannel({ name: "len-cap" });
  const chat = guild.addChannel({ name: "tro-chuyen" });
  const alice = gw.addPerson(guild, "alice");
  const bob = gw.addPerson(guild, "bob");
  const robot = guild.addMember({ name: "robot", bot: true });

  // the free plan cannot switch it on
  const refused = await gw.slash("hang", { guild, member: admin, sub: "caidat", options: { bat: true } });
  assert.match(refused.text, /gói Pro/);
  assert.equal(getSection(guild.id, "activity").enabled, false);
  await gw.say(alice, chat);
  assert.equal(getStats(guild.id, alice.id).xp, 0);

  pro(guild);
  const saved = await gw.slash("hang", { guild, member: admin, sub: "caidat", options: { bat: true, xptin: 50, cho: 10, toida: 100, giong: true, xpgiong: 5, kenh: announce } });
  assert.match(saved.text, new RegExp(activityLines.saved));

  // the cooldown: a second message in the same moment earns nothing, one after ten seconds does
  await gw.say(alice, chat);
  await gw.say(alice, chat);
  assert.equal(getStats(guild.id, alice.id).xp, 50);
  await gw.advance(11_000);
  await gw.say(alice, chat);
  assert.equal(getStats(guild.id, alice.id).xp, 100);

  // the daily cap of 100: nothing more today, however patient the chatter
  for (let i = 0; i < 3; i += 1) {
    await gw.advance(11_000);
    await gw.say(alice, chat);
  }
  assert.equal(getStats(guild.id, alice.id).xp, 100, "the cap holds");
  assert.equal(getStats(guild.id, alice.id).msgs, 2, "only messages that earned xp are counted");

  // bots, Discord's own notices and other people are handled separately
  await gw.say(robot, chat);
  await gw.join(guild, { name: "newcomer" });
  assert.equal(getStats(guild.id, robot.id).xp, 0);
  assert.equal(getStats(guild.id, bob.id).xp, 0);

  const card = rankCard(await gw.slash("hang", { guild, member: alice, sub: "xem" }));
  assert.equal(card[activityLines.fieldXp], "100");
  assert.equal(card[activityLines.fieldLevel], "1");
  assert.equal(card[activityLines.fieldRank], "#1");
  assert.equal(card[activityLines.fieldMsgs], "2");
  assert.ok(gw.sentTo(announce).some((r) => r.payload.content === levelUpLine(alice.id, 1)), "level 1 was announced");

  // the next day the cap is fresh
  await gw.advance(DAY + 60_000);
  await gw.say(alice, chat);
  assert.equal(getStats(guild.id, alice.id).xp, 150);

  // voice: two people in a room for ten minutes, nobody counted before the second person arrives
  await gw.slash("hang", { guild, member: admin, sub: "caidat", options: { toida: 5000 } });
  const room = guild.channelNamed("General");
  await gw.voice(alice, room);
  await gw.advance(5 * 60_000);
  await gw.voice(bob, room);
  await gw.advance(10 * 60_000);
  await gw.voice(alice, null);
  await gw.voice(bob, null);
  assert.equal(getStats(guild.id, alice.id).voiceMin, 10, "alone for five minutes earned nothing");
  assert.equal(getStats(guild.id, bob.id).voiceMin, 10);
  assert.equal(getStats(guild.id, bob.id).xp, 50);
  assert.equal(getStats(guild.id, alice.id).xp, 200);
  const voiceCard = rankCard(await gw.slash("hang", { guild, member: bob, sub: "xem" }));
  assert.equal(voiceCard[activityLines.fieldVoice], "10");

  // a deafened listener earns no time
  await gw.voice(alice, room);
  await gw.voice(bob, room, { selfDeaf: true });
  await gw.advance(10 * 60_000);
  await gw.voice(alice, null);
  await gw.voice(bob, null);
  assert.equal(getStats(guild.id, alice.id).voiceMin, 10, "alone with a deaf person counts for nothing");

  // enough chatting reaches level 5 and the level role
  const marker = gw.mark();
  for (let i = 0; i < 10; i += 1) {
    await gw.advance(11_000);
    await gw.say(alice, chat);
  }
  assert.ok(getStats(guild.id, alice.id).xp >= 675);
  const created = gw.since(marker).filter((r) => r.kind === "roleCreate");
  assert.equal(created.length, 1);
  assert.match(created[0].name, /^🏅 /);
  const given = gw.since(marker).filter((r) => r.kind === "roleAdd" && r.userId === alice.id);
  assert.equal(given.length, 1);
  assert.equal(given[0].roleId, created[0].roleId);
  assert.ok(loadRecord(guild.id).roles.includes(created[0].roleId), "recorded so /nuke knows it");
  assert.ok(!loadRecord(guild.id).pickRoles.includes(created[0].roleId), "and never self-assignable");
  assert.ok(gw.sentTo(announce).some((r) => r.payload.content === levelUpLine(alice.id, 5)));
  const top = rankCard(await gw.slash("hang", { guild, member: bob, sub: "xem", options: { nguoi: alice } }));
  assert.equal(top[activityLines.fieldLevel], "5");
  assert.equal(top[activityLines.fieldRank], "#1");
  assert.equal(gw.contentReads, 0, "no message content was read");
});

// ---------------------------------------------------------------- (e) giveaways, polls, role menus

const gives = await import("../../src/activity/giveaways.js");
const polls = await import("../../src/activity/polls.js");
const { lines: giveawayLines, pollLines } = await import("../../src/humor/giveaways.js").then((m) => ({ lines: m.lines, pollLines: m.pollLines }));

test("(e) giveaway: create, join, the job closes it exactly once, reroll until nobody is left", async () => {
  const guild = gw.createGuild();
  const mod = gw.addMod(guild);
  const channel = guild.addChannel({ name: "giveaway" });
  const people = ["g1", "g2", "g3"].map((n) => gw.addPerson(guild, n));

  const free = await gw.slash("quatang", { guild, member: mod, channel, sub: "tao", options: { giai: "Nitro", thoigian: 10 } });
  assert.match(free.text, /gói Pro/);
  assert.equal(gw.sentTo(channel).length, 0);

  pro(guild);
  const created = await gw.slash("quatang", { guild, member: mod, channel, sub: "tao", options: { giai: "Nitro", thoigian: 10, soluong: 1 } });
  const post = gw.sentTo(channel);
  assert.equal(post.length, 1);
  const joinId = customIdsOf(post[0].payload)[0];
  assert.match(joinId, /^quatang:join:\d+$/);
  const id = Number(joinId.split(":")[2]);
  assert.ok(created.text.includes(String(id)));

  // joining toggles; three people end up in
  const first = await gw.click(joinId, { member: people[0], channel });
  assert.equal(first.last.content, giveawayLines.joined(1));
  const left = await gw.click(joinId, { member: people[0], channel });
  assert.equal(left.last.content, giveawayLines.left(0));
  for (const p of people) await gw.click(joinId, { member: p, channel });
  assert.equal(gives.countEntries(id), 3);

  const listed = await gw.autocomplete("quatang", { guild, member: mod, channel, sub: "chonlai", focused: { name: "so", value: "" } });
  assert.deepEqual(listed.choices, [], "nothing ended yet, so nothing to reroll");

  // before the end the job leaves it alone, after the end it closes it once
  await gw.advance(9 * 60_000, { jobs: ["giveaways"] });
  assert.equal(gives.getGiveaway(id).status, "active");
  const marker = gw.mark();
  await gw.advance(90_000, { jobs: ["giveaways"] });
  assert.equal(gives.getGiveaway(id).status, "ended");
  const closing = gw.since(marker);
  const announced = closing.filter((r) => r.kind === "send" && r.channelId === channel.id);
  assert.equal(announced.length, 1, "one announcement");
  const winners = announced[0].payload.allowedMentions.users;
  assert.equal(winners.length, 1);
  assert.ok(people.some((p) => p.id === winners[0]));
  assert.deepEqual(announced[0].payload.allowedMentions.parse, [], "only the winner can be pinged");
  const edit = closing.find((r) => r.kind === "messageEdit");
  assert.deepEqual(customIdsOf(edit.payload), [], "the button is gone");
  await assert.rejects(() => gw.click(joinId, { member: people[0], channel }), /disabled|No button/);

  for (let i = 0; i < 3; i += 1) await gw.advance(31_000, { jobs: ["giveaways"] });
  assert.equal(gw.sentTo(channel).length, 2, "nothing more was posted by later ticks");
  assert.equal(gives.getGiveaway(id).winnerIds.length, 1);

  // reroll: each draw is somebody who has not won, until nobody is left
  const choices = await gw.autocomplete("quatang", { guild, member: mod, channel, sub: "chonlai", focused: { name: "so", value: "" } });
  assert.equal(choices.choices.length, 1);
  assert.equal(choices.choices[0].value, id);
  const drawn = new Set(winners);
  for (let i = 0; i < 2; i += 1) {
    const before = gw.sentTo(channel).length;
    await gw.slash("quatang", { guild, member: mod, channel, sub: "chonlai", options: { so: id } });
    const post2 = gw.sentTo(channel);
    assert.equal(post2.length, before + 1);
    const [fresh] = post2.at(-1).payload.allowedMentions.users;
    assert.ok(!drawn.has(fresh), "a new winner");
    drawn.add(fresh);
  }
  assert.equal(drawn.size, 3);
  const none = await gw.slash("quatang", { guild, member: mod, channel, sub: "chonlai", options: { so: id } });
  assert.equal(none.text, giveawayLines.nobodyLeft);

  // an ordinary member cannot manage it
  const nope = await gw.slash("quatang", { guild, member: people[0], channel, sub: "tao", options: { giai: "x", thoigian: 10 }, hidden: true });
  assert.ok(nope.text.length > 0);
  assert.equal(gives.countActive(guild.id), 0);
});

test("(e) a giveaway with a required role lets in only people who have it", async () => {
  const guild = gw.createGuild();
  pro(guild);
  const mod = gw.addMod(guild);
  const channel = guild.addChannel({ name: "giveaway" });
  const vip = guild.addRole({ name: "VIP", permissions: 0n, position: 5 });
  const holder = gw.addPerson(guild, "vip", [vip]);
  const plain = gw.addPerson(guild, "plain");
  await gw.slash("quatang", { guild, member: mod, channel, sub: "tao", options: { giai: "Áo", thoigian: 60, yeucau: vip } });
  const joinId = customIdsOf(gw.sentTo(channel)[0].payload)[0];
  const no = await gw.click(joinId, { member: plain, channel });
  assert.equal(no.last.content, giveawayLines.pressNeedRole(vip.id));
  const yes = await gw.click(joinId, { member: holder, channel });
  assert.equal(yes.last.content, giveawayLines.joined(1));
  const cancel = await gw.slash("quatang", { guild, member: mod, channel, sub: "huy", options: { so: Number(joinId.split(":")[2]) } });
  assert.ok(cancel.text.length > 0);
  assert.deepEqual(customIdsOf(gw.messages.findLast((m) => m.channelId === channel.id).payload), [], "cancelling removed the button");
});

test("(e) poll: vote, change the vote, the vote stays anonymous, and the job closes it", async () => {
  const guild = gw.createGuild();
  const mod = gw.addMod(guild);
  const channel = guild.addChannel({ name: "binh-chon" });
  const [p1, p2] = ["p1", "p2"].map((n) => gw.addPerson(guild, n));

  await gw.slash("binhchon", { guild, member: mod, channel, options: { cauhoi: "Ăn gì?", lua1: "Phở", lua2: "Bún", lua3: "Cơm", thoigian: 10 } });
  const post = gw.sentTo(channel);
  assert.equal(post.length, 1);
  const ids = customIdsOf(post[0].payload);
  const vote = (n) => ids.find((c) => c.startsWith("binhchon:v:") && c.endsWith(`:${n}`));
  const pollId = Number(vote(0).split(":")[2]);
  assert.ok(ids.some((c) => c.startsWith("binhchon:c:")), "a close button for staff");

  await gw.click(vote(0), { member: p1, channel });
  await gw.click(vote(1), { member: p2, channel });
  assert.deepEqual(polls.tally(pollId, 3), [1, 1, 0]);
  const changed = await gw.click(vote(2), { member: p1, channel });
  assert.deepEqual(polls.tally(pollId, 3), [0, 1, 1], "p1 moved their vote instead of voting twice");
  const shown = textOf(changed.finalPayload);
  assert.ok(!shown.includes(p1.id) && !shown.includes(p2.id), "nobody is named on the poll");

  await gw.advance(11 * 60_000, { jobs: ["giveaways"] });
  assert.ok(polls.getPoll(pollId).status !== "active");
  const last = gw.messages.findLast((m) => m.channelId === channel.id);
  assert.deepEqual(customIdsOf(last.payload), [], "the closed poll has no buttons");
  assert.ok(gw.find("messageEdit", (r) => r.channelId === channel.id).length >= 1);
  assert.deepEqual(polls.tally(pollId, 3), [0, 1, 1]);
});

test("(e) role menu: single mode swaps roles, pressing again removes, dangerous roles are refused, a long menu uses a select", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const channel = guild.addChannel({ name: "chon-role" });
  const red = guild.addRole({ name: "Đội Đỏ", permissions: 0n, position: 5 });
  const blue = guild.addRole({ name: "Đội Xanh", permissions: 0n, position: 5 });
  const danger = guild.addRole({ name: "Sếp", permissions: P.Administrator, position: 5 });
  const person = gw.addPerson(guild, "chon");

  const bad = await gw.slash("vaitro", { guild, member: admin, channel, sub: "tao", options: { tieude: "Xấu", chedo: "single", role1: red, role2: danger } });
  assert.equal(gw.sentTo(channel).length, 0, "no menu was posted");
  assert.ok(bad.text.length > 0);

  await gw.slash("vaitro", { guild, member: admin, channel, sub: "tao", options: { tieude: "Chọn đội", chedo: "single", role1: red, role2: blue } });
  const post = gw.sentTo(channel);
  assert.equal(post.length, 1);
  const [redButton, blueButton] = customIdsOf(post[0].payload);
  assert.match(redButton, new RegExp(`^vaitro:t:\\d+:${red.id}$`));

  const mark = gw.mark();
  await gw.click(redButton, { member: person, channel });
  assert.ok(person.roles.cache.has(red.id));
  await gw.click(blueButton, { member: person, channel });
  assert.ok(person.roles.cache.has(blue.id) && !person.roles.cache.has(red.id), "single mode swapped");
  await gw.click(blueButton, { member: person, channel });
  assert.ok(!person.roles.cache.has(blue.id), "pressing again took it back");
  const kinds = gw.since(mark).filter((r) => r.kind === "roleAdd" || r.kind === "roleRemove").map((r) => `${r.kind}:${r.roleName}`);
  assert.deepEqual(kinds, ["roleAdd:Đội Đỏ", "roleAdd:Đội Xanh", "roleRemove:Đội Đỏ", "roleRemove:Đội Xanh"]);

  // a role that turned dangerous after the menu was made cannot be given any more
  red.permissions = new red.permissions.constructor(P.Administrator);
  const refused = await gw.click(redButton, { member: person, channel });
  assert.ok(!person.roles.cache.has(red.id));
  assert.ok(refused.text.length > 0);

  // six roles do not fit in a row of buttons, so the menu is a select
  const many = Array.from({ length: 6 }, (_, i) => guild.addRole({ name: `Sở thích ${i}`, permissions: 0n, position: 5 }));
  await gw.slash("vaitro", { guild, member: admin, channel, sub: "tao", options: { tieude: "Sở thích", chedo: "multi", role1: many[0], role2: many[1], role3: many[2], role4: many[3], role5: many[4], role6: many[5] } });
  const menuId = customIdsOf(gw.sentTo(channel).at(-1).payload)[0];
  assert.match(menuId, /^vaitro:s:\d+$/);
  await gw.select(menuId, [many[2].id], { member: person, channel });
  await gw.select(menuId, [many[4].id], { member: person, channel });
  assert.ok(person.roles.cache.has(many[2].id) && person.roles.cache.has(many[4].id), "multi mode keeps both");
  await assert.rejects(() => gw.select(menuId, ["999"], { member: person, channel }), /no option/);
});

// ---------------------------------------------------------------- (f) moderation

const { modLines } = await import("../../src/humor/modlog.js");
const { countCases, listCases } = await import("../../src/modlog/cases.js");

test("(f) /canhcao then /timeout then /hoso shows both, and every refusal changes nothing", async () => {
  const guild = gw.createGuild();
  const owner = guild.members.cache.get(guild.ownerId);
  const log = guild.addChannel({ name: "nhat-ky" });
  const mod = gw.addMod(guild, "mod", ["ModerateMembers"]);
  const troll = gw.addPerson(guild, "troll");
  const senior = guild.addMember({ name: "senior", roles: [guild.addRole({ name: "Cấp trên", permissions: P.ModerateMembers, position: 450 })] });
  const boss = guild.addMember({ name: "boss", roles: [guild.addRole({ name: "Ông lớn", permissions: 0n, position: 1500 })] });
  const adminTarget = guild.addMember({ name: "adm", roles: [guild.addRole({ name: "Quản trị phụ", permissions: P.Administrator, position: 200 })] });
  const admin = gw.addAdmin(guild);

  await gw.slash("khoakhan", { guild, member: admin, sub: "nhatky", options: { bat: true, kenh: log } });

  const warn = await gw.slash("canhcao", { guild, member: mod, options: { nguoi: troll, lydo: "spam link" } });
  assert.match(warn.text, /Đã ghi cảnh cáo hồ sơ #\d+/);
  const dms = gw.find("dm", (r) => r.userId === troll.id);
  assert.equal(dms.length, 1, "the member was told");
  assert.match(dms[0].payload.content, /spam link/);

  const timed = await gw.slash("timeout", { guild, member: mod, options: { nguoi: troll, thoigian: 300, lydo: "cãi nhau" } });
  assert.match(timed.text, /Hồ sơ #\d+/);
  const stop = gw.find("timeout", (r) => r.userId === troll.id);
  assert.equal(stop.length, 1);
  assert.equal(stop[0].ms, 300_000);
  assert.equal(troll.communicationDisabledUntilTimestamp, gw.clock.now() + 300_000);
  assert.equal(countCases(guild.id, troll.id), 2);

  const file = await gw.slash("hoso", { guild, member: mod, options: { nguoi: troll } });
  const text = textOf(file.last);
  assert.match(text, /spam link/);
  assert.match(text, /cãi nhau/);
  assert.match(text, new RegExp(modLines.hosoFooter(2, 2)));
  assert.equal(file.sent[0].ephemeral, true, "the record is shown to staff only");

  // both actions reached the mod log channel
  const logged = gw.sentTo(log).map((r) => textOf(r.payload)).join("\n");
  assert.match(logged, /spam link/);
  assert.match(logged, /cãi nhau/);

  // refusals: nothing is changed, nothing is sent, no case is written
  const cases = () => getDb().prepare("SELECT COUNT(*) AS n FROM mod_cases WHERE guild_id = ?").get(guild.id).n;
  const before = { cases: cases(), marker: gw.mark() };
  const tries = [
    ["canhcao", mod, { nguoi: senior, lydo: "x" }, modLines.refusal.aboveYou],
    ["timeout", mod, { nguoi: owner, thoigian: 60, lydo: "x" }, modLines.refusal.owner],
    ["canhcao", mod, { nguoi: mod, lydo: "x" }, modLines.refusal.self],
    ["canhcao", mod, { nguoi: guild.members.me, lydo: "x" }, modLines.refusal.bot],
    ["timeout", owner, { nguoi: boss, thoigian: 60, lydo: "x" }, modLines.refusal.aboveBot],
    ["timeout", owner, { nguoi: adminTarget, thoigian: 60, lydo: "x" }, modLines.refusal.admin],
  ];
  for (const [name, actor, options, expected] of tries) {
    const done = await gw.slash(name, { guild, member: actor, options });
    assert.equal(done.text, expected, `${name} refusal`);
  }
  // a person without the permission, and a blank reason
  const rude = await gw.slash("canhcao", { guild, member: troll, options: { nguoi: mod, lydo: "x" }, hidden: true });
  assert.equal(rude.text, modLines.noPermission("ModerateMembers"));
  const blank = await gw.slash("canhcao", { guild, member: mod, options: { nguoi: troll, lydo: "   " } });
  assert.equal(blank.text, modLines.blankReason);
  await assert.rejects(() => gw.slash("canhcao", { guild, member: mod, options: { nguoi: troll, lydo: "x".repeat(301) } }), /over 300/, "Discord itself refuses a reason over 300 characters");
  const after = gw.since(before.marker);
  assert.equal(cases(), before.cases);
  assert.equal(after.filter((r) => ["timeout", "kick", "ban", "dm", "send"].includes(r.kind)).length, 0);
  assert.equal(listCases(guild.id, owner.id).length, 0);
});

test("(f) a ban through /ban is logged once, a ban made by hand is logged by the event, and /hoso shows the ban", async () => {
  const guild = gw.createGuild();
  const log = guild.addChannel({ name: "nhat-ky" });
  const admin = gw.addAdmin(guild);
  const mod = gw.addMod(guild, "mod");
  const bad = gw.addPerson(guild, "bad");
  const other = gw.addPerson(guild, "other");
  await gw.slash("khoakhan", { guild, member: admin, sub: "nhatky", options: { bat: true, kenh: log } });

  const done = await gw.slash("ban", { guild, member: mod, options: { nguoi: bad, lydo: "raid", xoatin: 1 } });
  assert.match(done.text, /Hồ sơ #\d+/);
  assert.ok(guild.bans.has(bad.id));
  assert.equal(gw.find("ban")[0].deleteMessageSeconds, 86400);
  assert.equal(gw.sentTo(log).length, 1, "one log entry, not two");
  assert.equal(gw.find("dm", (r) => r.userId === bad.id).length, 1, "told before the ban");

  await guild.members.ban(other.id, { reason: "by hand" });
  await gw.settle();
  assert.equal(gw.sentTo(log).length, 2, "an outside ban is logged from the event");

  const file = await gw.slash("hoso", { guild, member: mod, options: { nguoi: bad.user } });
  assert.match(textOf(file.last), /raid/);
});

// ---------------------------------------------------------------- (g) tickets

const { ticketLines } = await import("../../src/humor/tickets.js");
const { getTicket } = await import("../../src/tickets/store.js");

test("(g) a ticket is opened from the panel and closed, reopened and deleted, with the right people allowed in", async () => {
  const guild = gw.createGuild();
  pro(guild);
  const admin = gw.addAdmin(guild);
  const staffRole = guild.addRole({ name: "Hỗ trợ", permissions: 0n, position: 50 });
  const staff = guild.addMember({ name: "staff", roles: [staffRole] });
  const opener = gw.addPerson(guild, "khach");
  const stranger = gw.addPerson(guild, "la");
  const category = guild.addChannel({ name: "Tickets", type: ChannelType.GuildCategory });
  const panel = guild.addChannel({ name: "ho-tro" });
  const log = guild.addChannel({ name: "ticket-log" });

  const saved = await gw.slash("ticket", { guild, member: admin, sub: "caidat", options: { kenh: panel, role: staffRole, danhmuc: category, kenhlog: log, toida: 1 } });
  assert.ok(saved.text.length > 0);
  const posted = await gw.slash("ticket", { guild, member: admin, sub: "dang" });
  assert.ok(posted.text.length > 0);
  const panelMessage = gw.sentTo(panel);
  assert.equal(panelMessage.length, 1);
  const openId = customIdsOf(panelMessage[0].payload)[0];
  assert.match(openId, /^ticket:open:/);

  const asked = await gw.click(openId, { member: opener, channel: panel });
  assert.ok(asked.modal, "the reason is asked in a modal");
  const key = openId.split(":")[2];
  const submitted = await gw.submitModal(`ticket:modal:${key}`, { reason: "Không vào được server" }, { member: opener, channel: panel });
  const made = gw.find("channelCreate", (r) => r.guildId === guild.id && /^ticket-/.test(r.name));
  assert.equal(made.length, 1);
  const channel = guild.channels.cache.get(made[0].channelId);
  assert.equal(channel.parentId, category.id);
  assert.equal(channel.permissionsFor(opener).has(P.ViewChannel), true);
  assert.equal(channel.permissionsFor(staff).has(P.SendMessages), true);
  assert.equal(channel.permissionsFor(stranger).has(P.ViewChannel), false, "nobody else can see it");
  assert.match(submitted.text, new RegExp(channel.id));

  const first = gw.sentTo(channel);
  assert.equal(first.length, 1);
  assert.match(textOf(first[0].payload), /Không vào được server/);
  const ids = customIdsOf(first[0].payload);
  const ticketId = Number(ids[0].split(":")[2]);
  assert.deepEqual(ids, [`ticket:claim:${ticketId}`, `ticket:close:${ticketId}`, `ticket:closewhy:${ticketId}`]);
  assert.equal(getTicket(ticketId).status, "OPEN");

  // the same person cannot open a second one while the first is open
  const again = await gw.click(openId, { member: opener, channel: panel });
  assert.ok(again.text.length > 0);
  assert.equal(again.modal, null);

  // staff claim it, the opener cannot, a stranger cannot close
  const claimedByOpener = await gw.click(`ticket:claim:${ticketId}`, { member: opener, channel });
  assert.equal(getTicket(ticketId).claimed_by, null);
  assert.ok(claimedByOpener.text.length > 0);
  await gw.click(`ticket:claim:${ticketId}`, { member: staff, channel });
  assert.equal(getTicket(ticketId).claimed_by, staff.id);
  const denied = await gw.click(`ticket:close:${ticketId}`, { member: stranger, channel });
  assert.equal(getTicket(ticketId).status, "OPEN");
  assert.ok(denied.text.length > 0);

  // the opener closes it: their access goes, the notice carries reopen and delete
  const marker = gw.mark();
  await gw.click(`ticket:close:${ticketId}`, { member: opener, channel });
  assert.equal(getTicket(ticketId).status, "CLOSED");
  assert.equal(channel.permissionsFor(opener).has(P.ViewChannel), false);
  assert.equal(gw.since(marker).filter((r) => r.kind === "overwriteDelete" && r.targetId === opener.id).length, 1);
  const notice = gw.sentTo(channel).at(-1);
  assert.deepEqual(customIdsOf(notice.payload), [`ticket:delete:${ticketId}`, `ticket:reopen:${ticketId}`]);
  assert.ok(gw.sentTo(log).length >= 2, "opened and closed were logged");
  await gw.click(`ticket:close:${ticketId}`, { member: staff, channel }).catch(() => null);

  // staff reopen it, then delete the channel
  await gw.click(`ticket:reopen:${ticketId}`, { member: staff, channel });
  assert.equal(getTicket(ticketId).status, "OPEN");
  assert.equal(channel.permissionsFor(opener).has(P.ViewChannel), true, "access came back");
  await gw.click(`ticket:close:${ticketId}`, { member: staff, channel });
  await gw.click(`ticket:delete:${ticketId}`, { member: staff, channel });
  assert.equal(guild.channels.cache.has(channel.id), false);
  assert.equal(getTicket(ticketId).status, "CLOSED", "the row stays as history");
});

test("(g) a ticket nobody writes in is closed by the job, and the cooldown stops a person from opening in a hurry", async () => {
  const guild = gw.createGuild();
  pro(guild);
  const admin = gw.addAdmin(guild);
  const staffRole = guild.addRole({ name: "Hỗ trợ", permissions: 0n, position: 50 });
  const opener = gw.addPerson(guild, "khach");
  const panel = guild.addChannel({ name: "ho-tro" });
  await gw.slash("ticket", { guild, member: admin, sub: "caidat", options: { kenh: panel, role: staffRole, tudong: 1, toida: 2 } });
  await gw.slash("ticket", { guild, member: admin, sub: "dang" });
  const openId = customIdsOf(gw.sentTo(panel)[0].payload)[0];
  const key = openId.split(":")[2];

  await gw.click(openId, { member: opener, channel: panel });
  await gw.submitModal(`ticket:modal:${key}`, { reason: "Cần giúp" }, { member: opener, channel: panel });
  const quick = await gw.click(openId, { member: opener, channel: panel });
  assert.equal(quick.modal, null, "the cooldown applies");
  assert.match(quick.text, /\d+/);

  await gw.advance(59 * 60_000);
  assert.equal(await gw.runJob("tickets"), 0, "not yet an hour");
  await gw.advance(2 * 60_000);
  assert.equal(await gw.runJob("tickets"), 1);
  assert.equal(await gw.runJob("tickets"), 0, "and only once");
  const channel = guild.textChannels().find((c) => /^ticket-/.test(c.name));
  assert.ok(gw.sentTo(channel).some((r) => textOf(r.payload).includes(ticketLines.autoClosed)));
  assert.equal(channel.permissionsFor(opener).has(P.ViewChannel), false);
});

// ---------------------------------------------------------------- (h) payments and the trial

const orders = await import("../../src/pay/orders.js");

// A Stripe that records what it was asked and says "paid" when the test flips the switch
function stripeStub() {
  const state = { paid: false, sessions: new Map(), mismatch: false, fail: false };
  const calls = gw.stubFetch((url, init) => {
    if (init.method === "POST" && url.endsWith("/v1/checkout/sessions")) {
      if (state.fail) return { status: 500, body: { error: { type: "api_error", message: "down" } } };
      const form = new URLSearchParams(init.body);
      const id = `cs_e2e_${state.sessions.size + 1}`;
      state.sessions.set(id, form);
      return { body: { id, url: `https://checkout.stripe.com/c/pay/${id}` } };
    }
    const id = decodeURIComponent(url.split("/").pop());
    const form = state.sessions.get(id);
    if (!form) return { status: 404, body: { error: { type: "invalid_request_error", message: "no such session" } } };
    return {
      body: {
        id,
        client_reference_id: form.get("client_reference_id"),
        amount_total: state.mismatch ? 1 : Number(form.get("line_items[0][price_data][unit_amount]")),
        currency: "usd",
        status: state.paid ? "complete" : "open",
        payment_status: state.paid ? "paid" : "unpaid",
      },
    };
  });
  return { state, calls };
}

const licenseRows = (guild) => getDb().prepare("SELECT COUNT(*) AS n FROM licenses WHERE guild_id = ?").get(guild.id).n;

test("(h) /mua with Stripe: order, the job polls, the plan switches on once", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const channel = guild.addChannel({ name: "mua-goi" });
  const stripe = stripeStub();

  const hidden = await gw.slash("mua", { guild, member: gw.addPerson(guild, "khach"), channel, options: { goi: "pro" }, hidden: true });
  assert.equal(stripe.calls.length, 0, "a member without Administrator is refused before anything is asked of Stripe");
  assert.ok(hidden.text.length > 0);

  const made = await gw.slash("mua", { guild, member: admin, channel, options: { goi: "pro", ngay: 30, cach: "stripe" } });
  const create = stripe.calls[0];
  assert.equal(create.init.method, "POST");
  assert.equal(create.init.headers.authorization, "Bearer sk_test_e2e");
  const form = stripe.state.sessions.get("cs_e2e_1");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "399");
  assert.equal(form.get("metadata[guild_id]"), guild.id);
  assert.equal(create.init.headers["idempotency-key"], `order-${form.get("client_reference_id")}`);
  const link = componentsOf(made.finalPayload)[0];
  assert.equal(link.url, "https://checkout.stripe.com/c/pay/cs_e2e_1");
  assert.equal(link.style, 5);
  assert.match(textOf(made.finalPayload), /\$3\.99/);
  const [order] = orders.recentOrders(5, guild.id);
  assert.deepEqual([order.status, order.plan, order.days, order.amount, order.provider], ["PENDING", "pro", 30, 399, "stripe"]);
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "free");

  // not paid yet: polled, nothing changes
  await gw.advance(31_000, { jobs: ["payments"] });
  assert.equal(stripe.calls.length, 2);
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "free");
  assert.equal(orders.getOrder(order.order_code).status, "PENDING");

  // paid: the plan switches on, the buyer is told in the channel where they asked
  stripe.state.paid = true;
  const marker = gw.mark();
  await gw.advance(31_000, { jobs: ["payments"] });
  const plan = getPlan(guild.id, gw.clock.now());
  assert.equal(plan.plan, "pro");
  assert.equal(plan.expiresAt, gw.clock.now() + 30 * DAY);
  assert.equal(orders.getOrder(order.order_code).status, "PAID");
  const told = gw.since(marker).filter((r) => r.kind === "send" && r.channelId === channel.id);
  assert.equal(told.length, 1);
  assert.deepEqual(told[0].payload.allowedMentions, { users: [admin.id] });

  // and only once, however often the job runs
  const asked = stripe.calls.length;
  for (let i = 0; i < 3; i += 1) await gw.advance(31_000, { jobs: ["payments"] });
  assert.equal(stripe.calls.length, asked, "a paid order is not asked about again");
  assert.equal(licenseRows(guild), 1);
  assert.equal(gw.sentTo(channel).length, 1);
  assert.equal(getPlan(guild.id, gw.clock.now()).expiresAt, plan.expiresAt, "the expiry did not move");

  // pro unlocks pro features at once
  const quatang = await gw.slash("quatang", { guild, member: gw.addMod(guild), channel, sub: "tao", options: { giai: "Quà", thoigian: 10 } });
  assert.doesNotMatch(quatang.text, /gói Pro/);
});

test("(h) a session that does not match the order, or a Stripe that is down, never switches a plan on", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const channel = guild.addChannel({ name: "mua-goi" });
  const stripe = stripeStub();

  stripe.state.fail = true;
  const failed = await gw.slash("mua", { guild, member: admin, channel, options: { goi: "plus" } });
  assert.equal(orders.recentOrders(5, guild.id)[0].status, "FAILED");
  assert.equal(componentsOf(failed.finalPayload).length, 0, "no link was offered");
  stripe.state.fail = false;

  await gw.slash("mua", { guild, member: admin, channel, options: { goi: "plus" } });
  stripe.state.paid = true;
  stripe.state.mismatch = true;
  await gw.advance(31_000, { jobs: ["payments"] });
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "free");
  assert.equal(licenseRows(guild), 0);

  stripe.state.mismatch = false;
  await gw.advance(31_000, { jobs: ["payments"] });
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "plus");

  // an order nobody pays expires and stops being asked about
  const other = gw.createGuild();
  stripe.state.paid = false;
  await gw.slash("mua", { guild: other, member: gw.addAdmin(other), channel: other.systemChannel, options: { goi: "pro" } });
  await gw.advance(36 * 60_000);
  await gw.runJob("payments");
  assert.equal(orders.recentOrders(5, other.id)[0].status, "EXPIRED");
});

test("(h) /dungthu works once only, and /mua dungiup is refused on a server that already pays", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const trial = await gw.slash("dungthu", { guild, member: admin });
  assert.match(trial.text, /dùng thử 7 ngày/);
  const plan = getPlan(guild.id, gw.clock.now());
  assert.equal(plan.plan, "pro");
  assert.equal(plan.expiresAt, gw.clock.now() + 7 * DAY);

  const twice = await gw.slash("dungthu", { guild, member: admin });
  assert.match(twice.text, /một lần rồi/, "not again while the trial runs either");

  await gw.advance(8 * DAY);
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "free");
  const again = await gw.slash("dungthu", { guild, member: admin });
  assert.match(again.text, /một lần rồi/);
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, "free", "no second trial");

  // the one-off: refused when the server pays, available (once paid) when it does not
  const stripe = stripeStub();
  const payer = gw.createGuild();
  grant(payer.id, "plus", 30, gw.clock.now());
  const noTrial = await gw.slash("dungthu", { guild: payer, member: gw.addAdmin(payer) });
  assert.match(noTrial.text, /đang có gói trả phí/, "a paying server does not need the trial");
  const refused = await gw.slash("mua", { guild: payer, member: gw.addAdmin(payer), options: { goi: "dungiup" } });
  assert.match(refused.text, /đang có gói trả phí/);
  assert.equal(orders.recentOrders(5, payer.id).length, 0);
  assert.equal(stripe.calls.length, 0);

  const buyer = gw.createGuild();
  const buyerAdmin = gw.addAdmin(buyer);
  await gw.slash("mua", { guild: buyer, member: buyerAdmin, options: { goi: "dungiup" } });
  const [order] = orders.recentOrders(5, buyer.id);
  assert.deepEqual([order.plan, order.days, order.amount], ["dungiup", 7, 499]);
  stripe.state.paid = true;
  await gw.advance(31_000, { jobs: ["payments"] });
  const granted = getPlan(buyer.id, gw.clock.now());
  assert.equal(granted.plan, "pro");
  assert.equal(granted.expiresAt, gw.clock.now() + 7 * DAY);
});

// ---------------------------------------------------------------- (i) /xoadulieu

const { flushXp } = await import("../../src/activity/xp.js");

test("(i) /xoadulieu purges the data and lifts a lockdown, and nothing comes back afterwards", async () => {
  const guild = gw.createGuild({ attach: true });
  const owner = guild.members.cache.get(guild.ownerId);
  const chat = guild.addChannel({ name: "tro-chuyen" });
  const talker = gw.addPerson(guild, "noi-nhieu");
  const victim = gw.addPerson(guild, "bi-phat");

  // a server in use: built through the wizard, on Pro, with activity, a warning, a giveaway, a poll, a role menu and a lockdown
  pro(guild);
  await gw.slash("batdau", { guild, member: owner });
  await gw.select(`batdau:theme:${owner.id}`, ["gaming"], { member: owner });
  await gw.click(`batdau:go:${owner.id}`, { member: owner });
  assert.ok(guild.automodRules.size > 0);
  const mod = gw.addMod(guild);
  const channel = chat;
  const colour = guild.addRole({ name: "Màu cam", permissions: 0n, position: 5 });
  await gw.slash("hang", { guild, member: owner, sub: "caidat", options: { bat: true, xptin: 50, cho: 10, toida: 5000 } });
  await gw.say(talker, chat);
  await gw.slash("canhcao", { guild, member: mod, options: { nguoi: victim, lydo: "ồn ào" } });
  await gw.slash("quatang", { guild, member: mod, channel, sub: "tao", options: { giai: "Quà", thoigian: 60 } });
  await gw.click(customIdsOf(gw.sentTo(channel).at(-1).payload)[0], { member: talker, channel });
  await gw.slash("binhchon", { guild, member: mod, channel, options: { cauhoi: "Thích không?", lua1: "Có", lua2: "Không" } });
  await gw.slash("vaitro", { guild, member: owner, channel, sub: "tao", options: { tieude: "Màu", chedo: "multi", role1: colour } });
  const before = overwriteMap(guild);
  await gw.slash("khoakhan", { guild, member: owner, sub: "bat" });
  assert.equal(getSection(guild.id, "security").lockdown.active, true);
  assert.notDeepEqual(overwriteMap(guild), before);

  const tables = ["guilds", "guild_settings", "xp", "mod_cases", "giveaways", "polls", "role_menus", "tickets", "audit_reports", "backups", "scores"];
  const rows = (table) => getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "guilds" ? "id" : "guild_id"} = ?`).get(guild.id).n;
  flushXp();
  for (const table of ["guilds", "guild_settings", "xp", "mod_cases", "giveaways", "polls", "role_menus", "audit_reports"]) assert.ok(rows(table) > 0, `${table} has data to purge`);
  const buildsUsed = getUsage(guild.id, "build", { lifetime: true });
  const planBefore = getPlan(guild.id, gw.clock.now());
  const ruleCount = guild.automodRules.size;
  assert.ok(ruleCount > 0);

  // someone else cannot press the owner's button, and "no" keeps everything
  const ask = await gw.slash("xoadulieu", { guild, member: owner });
  assert.deepEqual(customIdsOf(ask.finalPayload), [`xoadulieu:go:${owner.id}`, `xoadulieu:no:${owner.id}`]);
  const other = await gw.click(`xoadulieu:go:${owner.id}`, { member: mod, channel: ask.channel, message: ask.surface });
  assert.ok(rows("guild_settings") > 0, "the wrong person changed nothing");
  assert.ok(other.text.length > 0);
  const kept = await gw.click(`xoadulieu:no:${owner.id}`, { member: owner, channel: ask.channel, message: ask.surface });
  assert.ok(rows("guild_settings") > 0 && getSection(guild.id, "security").lockdown.active);
  assert.ok(kept.text.length > 0);

  // a message sent right before the purge has xp that was not written yet
  await gw.advance(11_000);
  await gw.say(talker, chat);
  const sure = await gw.slash("xoadulieu", { guild, member: owner });
  const done = await gw.click(`xoadulieu:go:${owner.id}`, { member: owner, channel: sure.channel, message: sure.surface });
  assert.match(done.text, /Đã quên sạch/);

  flushXp();
  assert.equal(rows("xp"), 0, "xp that was still waiting to be written did not come back");
  assert.equal(getSection(guild.id, "security").lockdown.active, false);
  assert.deepEqual(overwriteMap(guild), before, "the lockdown was lifted and every channel is as it was");
  assert.equal(guild.automodRules.size, 0, "the AutoMod rules the bot made are gone from the server");
  for (const table of tables) assert.equal(rows(table), 0, `${table} was purged`);
  assert.equal(getSection(guild.id, "setup").done, false);
  assert.deepEqual(loadRecord(guild.id).channels, []);

  // billing is kept, and the server itself is untouched
  assert.equal(getUsage(guild.id, "build", { lifetime: true }), buildsUsed);
  assert.equal(getPlan(guild.id, gw.clock.now()).plan, planBefore.plan);
  assert.ok(guild.channels.cache.has(chat.id), "channels on Discord stay");

  // the forgotten server does not grow data again: unwritten xp, cached settings and the in-memory cooldown are all gone
  await gw.advance(11_000);
  await gw.say(talker, chat);
  await gw.advance(16_000);
  flushXp();
  assert.equal(rows("xp"), 0, "no xp came back after the purge");
  const nuke = await gw.slash("nuke", { guild, member: owner });
  assert.doesNotMatch(nuke.text, /\*\*\d+\*\* hạng mục/, "/nuke has nothing it recognises");
  const rank = await gw.slash("hang", { guild, member: talker, sub: "xem" });
  assert.ok(rank.text.length > 0);
});

// ---------------------------------------------------------------- (j) what Discord would accept, and who handles every component

const { readFileSync, readdirSync, statSync } = await import("node:fs");
const nodePath = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { GatewayIntentBits, IntentsBitField } = await import("discord.js");
const srcRoot = nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = nodePath.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".js") ? [full] : [];
  });
}

const NAME = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
const OPTION_TYPES = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11 };

// Everything Discord rejects when a command is registered, written down from its documentation
function commandProblems(json) {
  const problems = [];
  const bad = (where, why) => problems.push(`/${json.name} ${where}: ${why}`);
  let size = 0;
  const text = (where, name, description) => {
    if (!NAME.test(name) || name !== name.toLowerCase()) bad(where, `name "${name}" is not a valid lowercase name`);
    if (typeof description !== "string" || description.length < 1 || description.length > 100) bad(where, `description is ${description?.length ?? 0} characters`);
    size += name.length + (description?.length ?? 0);
  };
  const checkOptions = (where, options, depth) => {
    if (options.length > 25) bad(where, `${options.length} options`);
    const names = new Set();
    const kinds = new Set(options.map((o) => (o.type === OPTION_TYPES.SUB || o.type === OPTION_TYPES.GROUP ? "sub" : "plain")));
    if (kinds.size > 1) bad(where, "subcommands mixed with plain options");
    let optional = false;
    for (const o of options) {
      const at = `${where}/${o.name}`;
      text(at, o.name, o.description);
      if (names.has(o.name)) bad(at, "duplicate name");
      names.add(o.name);
      if (o.type === OPTION_TYPES.GROUP) {
        if (depth !== 0) bad(at, "a group inside something other than the command");
        if (!(o.options ?? []).every((s) => s.type === OPTION_TYPES.SUB)) bad(at, "a group holds only subcommands");
        checkOptions(at, o.options ?? [], 1);
      } else if (o.type === OPTION_TYPES.SUB) {
        if (depth > 1) bad(at, "subcommand nested too deep");
        if ((o.options ?? []).some((x) => x.type === OPTION_TYPES.SUB || x.type === OPTION_TYPES.GROUP)) bad(at, "a subcommand holds subcommands");
        checkOptions(at, o.options ?? [], 2);
      } else {
        if (o.required && optional) bad(at, "a required option after an optional one");
        if (!o.required) optional = true;
        if (o.choices) {
          if (![OPTION_TYPES.STRING, OPTION_TYPES.INTEGER, OPTION_TYPES.NUMBER].includes(o.type)) bad(at, "choices on an option that cannot have them");
          if (o.choices.length > 25) bad(at, "more than 25 choices");
          if (o.autocomplete) bad(at, "choices and autocomplete together");
          const values = new Set();
          for (const c of o.choices) {
            if (!c.name || c.name.length > 100) bad(at, `choice name "${c.name}" out of range`);
            if (typeof c.value === "string" && (c.value.length < 1 || c.value.length > 100)) bad(at, "choice value out of range");
            if (o.type === OPTION_TYPES.INTEGER && !Number.isInteger(c.value)) bad(at, "integer choice is not a whole number");
            if (values.has(c.value)) bad(at, "duplicate choice value");
            values.add(c.value);
            size += c.name.length + (typeof c.value === "string" ? c.value.length : 0);
          }
        }
        if (o.min_value !== undefined && o.max_value !== undefined && o.min_value > o.max_value) bad(at, "min_value over max_value");
        if (o.min_length !== undefined && (o.min_length < 0 || o.min_length > 6000)) bad(at, "min_length out of range");
        if (o.max_length !== undefined && (o.max_length < 1 || o.max_length > 6000)) bad(at, "max_length out of range");
        if (o.min_length !== undefined && o.max_length !== undefined && o.min_length > o.max_length) bad(at, "min_length over max_length");
        if (o.channel_types && o.type !== OPTION_TYPES.CHANNEL) bad(at, "channel types on a non-channel option");
        if (o.autocomplete && ![OPTION_TYPES.STRING, OPTION_TYPES.INTEGER, OPTION_TYPES.NUMBER].includes(o.type)) bad(at, "autocomplete on the wrong type");
      }
    }
  };
  text("", json.name, json.description);
  checkOptions("", json.options ?? [], 0);
  if (size > 8000) bad("", `${size} characters in total, Discord allows 8000`);
  if (json.default_member_permissions !== null && json.default_member_permissions !== undefined && !/^\d+$/.test(json.default_member_permissions)) bad("", "default_member_permissions is not a bit string");
  return problems;
}

test("(j) every registered command is valid for Discord, and the checker really catches mistakes", () => {
  const all = [...gw.client.commands.values()].map((c) => c.data.toJSON());
  assert.ok(all.length >= 30, `${all.length} commands registered`);
  assert.ok(all.length < 100, "Discord allows fewer than 100 chat commands");
  assert.equal(new Set(all.map((c) => c.name)).size, all.length, "names are unique");
  const problems = all.flatMap(commandProblems);
  assert.deepEqual(problems, []);

  // the checker itself: each kind of mistake is reported
  const base = { name: "ok", description: "fine", options: [] };
  const sample = (patch) => commandProblems({ ...base, ...patch });
  assert.ok(sample({ name: "Bad Name" }).length);
  assert.ok(sample({ description: "x".repeat(101) }).length);
  assert.ok(sample({ description: "" }).length);
  assert.ok(sample({ options: Array.from({ length: 26 }, (_, i) => ({ name: `o${i}`, description: "d", type: 3 })) }).length);
  assert.ok(sample({ options: [{ name: "a", description: "d", type: 3 }, { name: "b", description: "d", type: 3, required: true }] }).length);
  assert.ok(sample({ options: [{ name: "a", description: "d", type: 1 }, { name: "b", description: "d", type: 3 }] }).length);
  assert.ok(sample({ options: [{ name: "a", description: "d", type: 3, choices: Array.from({ length: 26 }, (_, i) => ({ name: `c${i}`, value: `v${i}` })) }] }).length);
  assert.ok(sample({ options: [{ name: "a", description: "d", type: 4, min_value: 5, max_value: 1 }] }).length);
  assert.deepEqual(sample({}), []);

  // what the deploy script would send is the same list
  const deploy = readFileSync(nodePath.join(srcRoot, "deploy-commands.js"), "utf8");
  assert.match(deploy, /command\.data\.toJSON\(\)/);
});

test("(j) the harness registers commands, events and jobs exactly as the bot does", () => {
  const entry = readFileSync(nodePath.join(srcRoot, "index.js"), "utf8");
  assert.match(entry, /readdirSync\(path\.join\(__dirname, "commands"\)\)\.filter\(\(f\) => f\.endsWith\("\.js"\)\)/);
  assert.match(entry, /client\.commands\.set\(command\.data\.name, command\)/);
  assert.match(entry, /readdirSync\(path\.join\(__dirname, "events"\)\)\.filter\(\(f\) => f\.endsWith\("\.js"\)\)/);
  assert.match(entry, /event\.once \? client\.once\.bind\(client\) : client\.on\.bind\(client\)/);
  assert.match(entry, /register\(event\.name, \(\.\.\.args\) => event\.execute\(client, \.\.\.args\)\)/);

  const files = (dir) => readdirSync(nodePath.join(srcRoot, dir)).filter((f) => f.endsWith(".js"));
  assert.equal(gw.client.commands.size, files("commands").length);
  assert.equal(gw.events.length, files("events").length);
  assert.equal(gw.jobs.size, files("jobs").length);
  for (const [name, { job }] of gw.jobs) {
    assert.equal(typeof job.run, "function", name);
    assert.ok(job.everyMs >= 1000, `${name} has an interval`);
  }
  // every kind of interaction reaches the one router
  const interaction = gw.events.filter((e) => e.name === Events.InteractionCreate);
  assert.equal(interaction.length, 1);
  for (const command of gw.client.commands.values()) {
    assert.equal(typeof command.execute, "function", command.data.name);
    if (command.data.toJSON().options?.some((o) => o.autocomplete || o.options?.some((x) => x.autocomplete))) assert.equal(typeof command.autocomplete, "function", `${command.data.name} has autocomplete options but no handler`);
  }
});

// Which builder a custom id is set on, from the text just before it
function builderBefore(text, index) {
  const window = text.slice(Math.max(0, index - 260), index);
  const all = [...window.matchAll(/new (ButtonBuilder|StringSelectMenuBuilder|ModalBuilder|TextInputBuilder)\(/g)];
  return all.at(-1)?.[1] ?? null;
}

function ownerOf(scope, kind) {
  if (scope === "bp") return "bp";
  if (scope === "pickrole") return kind === "button" ? "pickrole" : null;
  const owner = gw.client.commands.get(scope);
  if (!owner) return null;
  if (typeof owner.handleComponent === "function") return scope;
  if (kind === "button" && typeof owner.handleButton === "function") return scope;
  return null;
}

test("(j) every custom id the code can create is routed to a handler", () => {
  // by reading the code: every literal id in src
  const seen = new Map();
  const unrouted = [];
  for (const file of walk(srcRoot)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/setCustomId\(\s*([`"'])([^`"']*)\1/g)) {
      const id = match[2];
      const builder = builderBefore(text, match.index);
      const where = `${nodePath.relative(srcRoot, file)}: ${id}`;
      if (!id.includes(":")) {
        // an input inside a modal, answered with the modal's own id
        if (builder !== "TextInputBuilder") unrouted.push(`${where} (no scope and not a text input)`);
        continue;
      }
      const scope = id.split(":")[0];
      const kind = builder === "StringSelectMenuBuilder" ? "select" : builder === "ModalBuilder" ? "modal" : "button";
      seen.set(scope, (seen.get(scope) ?? 0) + 1);
      if (!ownerOf(scope, kind)) unrouted.push(`${where} (${kind})`);
    }
  }
  assert.deepEqual(unrouted, []);
  assert.ok(seen.size >= 15, `${seen.size} scopes found in the code`);

  // by watching the run: every id of every message, menu and modal the flows above caused
  const driven = new Map();
  const walkIds = (json, kind) => {
    for (const c of componentsOf({ components: json })) {
      if (!c.custom_id) continue;
      const k = c.type === 3 ? "select" : "button";
      driven.set(c.custom_id.split(":")[0], (driven.get(c.custom_id.split(":")[0]) ?? 0) + 1);
      assert.ok(ownerOf(c.custom_id.split(":")[0], k ?? kind), `${c.custom_id} posted in a ${k} has no handler`);
    }
  };
  for (const message of gw.messages) for (const history of message.history) walkIds(history.components ?? [], "button");
  for (const { json } of gw.modals) {
    assert.ok(ownerOf(json.custom_id.split(":")[0], "modal"), `modal ${json.custom_id} has no handler`);
    driven.set(json.custom_id.split(":")[0], 1);
  }
  for (const scope of ["batdau", "khoakhan", "quatang", "binhchon", "vaitro", "pickrole", "ticket", "xoadulieu", "nuke"]) assert.ok(driven.has(scope), `the flows drove ${scope}`);
  assert.ok(!gw.consoleErrors.some((line) => /Interaction error/.test(line)), "no interaction went down the router's error path");
});

// ---------------------------------------------------------------- (k) no privileged intents, no message content

const PRIVILEGED = { GuildMembers: GatewayIntentBits.GuildMembers, GuildPresences: GatewayIntentBits.GuildPresences, MessageContent: GatewayIntentBits.MessageContent };

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("(k) the Client asks for no privileged intent, and every handler's event is covered by an intent it has", () => {
  const entry = readFileSync(nodePath.join(srcRoot, "index.js"), "utf8");
  const block = /intents:\s*\[([\s\S]*?)\]/.exec(stripComments(entry));
  assert.ok(block, "found the intents list");
  const names = [...block[1].matchAll(/GatewayIntentBits\.(\w+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 4);
  for (const name of names) assert.ok(name in GatewayIntentBits, `${name} is a real intent`);
  for (const forbidden of Object.keys(PRIVILEGED)) assert.ok(!names.includes(forbidden), `${forbidden} must not be requested`);
  const bits = new IntentsBitField(names.map((n) => GatewayIntentBits[n]));
  for (const [name, bit] of Object.entries(PRIVILEGED)) assert.equal(bits.has(bit), false, name);
  assert.deepEqual([...names].sort(), ["AutoModerationExecution", "GuildMessages", "GuildModeration", "GuildVoiceStates", "Guilds"], "the intent list is exactly the reviewed one");
  assert.equal(/MessageContent|GuildMembers|GuildPresences/.test(stripComments(entry)), false, "index.js does not even name them");

  // each event the bot listens for arrives through one of those intents, and none needs a privileged one
  const needs = {
    [Events.MessageCreate]: "GuildMessages",
    [Events.VoiceStateUpdate]: "GuildVoiceStates",
    [Events.GuildBanAdd]: "GuildModeration",
    [Events.GuildBanRemove]: "GuildModeration",
    [Events.AutoModerationActionExecution]: "AutoModerationExecution",
    [Events.GuildCreate]: "Guilds",
    [Events.GuildDelete]: "Guilds",
    [Events.ChannelDelete]: "Guilds",
    [Events.GuildRoleDelete]: "Guilds",
    [Events.GuildRoleUpdate]: "Guilds",
    [Events.InteractionCreate]: null,
    [Events.ClientReady]: null,
  };
  for (const { name, file } of gw.events) {
    assert.ok(name in needs, `${file} listens to ${name}, which this check does not know yet`);
    if (needs[name]) assert.ok(names.includes(needs[name]), `${file} needs ${needs[name]}`);
  }
});

test("(k) no module under src reads the content of a message, and none was read during the flows", () => {
  const allowed = new Map([
    // the bot's own outgoing payloads, and Gemini's response shape
    ["payload", "the bot's own message payload"],
    ["post", "the welcome text the bot itself built, shown back in a preview"],
    ["]", "candidates?.[0]?.content, the shape of Gemini's answer"],
  ]);
  const offenders = [];
  let scanned = 0;
  for (const file of walk(srcRoot)) {
    const text = stripComments(readFileSync(file, "utf8"));
    scanned += 1;
    const where = nodePath.relative(srcRoot, file);
    for (const match of text.matchAll(/([A-Za-z_$][\w$]*|\])\??\.(content|cleanContent)\b/g)) {
      if (!allowed.has(match[1])) offenders.push(`${where}: ${match[0]}`);
    }
    for (const match of text.matchAll(/\bconst\s*\{[^}]*\b(content|cleanContent)\b[^}]*\}\s*=\s*(\w+)/g)) offenders.push(`${where}: destructures ${match[1]} from ${match[2]}`);
    for (const match of text.matchAll(/\[\s*["'](content|cleanContent)["']\s*\]/g)) offenders.push(`${where}: indexes ${match[1]}`);
    // the content intent also changes embeds, attachments and components of other people's messages
    if (/events[\\/]/.test(where)) {
      for (const match of text.matchAll(/\bmessage\.(embeds|attachments|components|stickers|mentions)\b/g)) offenders.push(`${where}: ${match[0]}`);
    }
  }
  assert.ok(scanned > 100, `${scanned} files scanned`);
  assert.deepEqual(offenders, []);
  assert.ok(allowed.size > 0);

  // the scan finds what it should
  const sample = stripComments("const a = message.content; const { content } = msg; const z = m['content'];");
  assert.equal([...sample.matchAll(/([A-Za-z_$][\w$]*|\])\??\.(content|cleanContent)\b/g)].length, 1);
  assert.equal([...sample.matchAll(/\bconst\s*\{[^}]*\b(content|cleanContent)\b[^}]*\}\s*=\s*(\w+)/g)].length, 1);
  assert.equal([...sample.matchAll(/\[\s*["'](content|cleanContent)["']\s*\]/g)].length, 1);

  // and during the whole run above, every message the handlers received had its content counted when read
  assert.equal(gw.contentReads, 0, "no handler read message.content in any flow");
  assert.equal(gw.errors.length, 0);
});
