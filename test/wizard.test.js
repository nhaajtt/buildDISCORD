import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "wizard-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";
process.env.OWNER_IDS = "owner-1";

const wizard = await import("../src/onboarding/wizard.js");
const batdau = (await import("../src/commands/batdau.js")).default;
const trogiup = (await import("../src/commands/trogiup.js")).default;
const goi = (await import("../src/commands/goi.js")).default;
const admin = (await import("../src/commands/admin.js")).default;
const { funnelEmbed } = await import("../src/commands/admin.js");
const guildCreate = (await import("../src/events/guildCreate.js")).default;
const { getSection, patchSection } = await import("../src/settings.js");
const { grant, getUsage, startTrial } = await import("../src/license.js");
const { funnel, track } = await import("../src/analytics.js");
const { buildServer } = await import("../src/builder.js");
const { themes } = await import("../src/themes/index.js");
const { lock } = await import("../src/utils/guards.js");

const { suggestTheme, normalizeText, applyThemes, applyHumor, applyExtras, cleanChoices, gateWizard, pickChannel, buildResultEmbed, prideLine, nextSteps, runWizard, defaultChoices, EXTRA_KEYS } = wizard;

let next = 900000000000000000n;
const sf = () => String(next++);

// A guild that behaves like discord.js for what the wizard, the builder, the audit and AutoMod touch
function fakeGuild({ manageGuild = true, id = sf() } = {}) {
  const roles = new Collection();
  const channels = new Collection();
  const rules = new Map();
  const sent = [];
  const attach = (collection, item) => {
    item.delete = async () => collection.delete(item.id);
    collection.set(item.id, item);
    return item;
  };
  roles.everyone = { id: "everyone" };
  const guild = {
    id,
    name: "Server Thử",
    sent,
    rules,
    systemChannel: null,
    roles: {
      cache: roles,
      everyone: roles.everyone,
      create: async (o) => attach(roles, { id: sf(), ...o }),
      fetch: async (rid) => (rid ? roles.get(rid) ?? null : roles),
    },
    channels: {
      cache: channels,
      create: async (o) => {
        const channel = { id: sf(), ...o, parentId: o.parent ?? null };
        if (o.type !== ChannelType.GuildCategory && o.type !== ChannelType.GuildVoice) channel.name = String(o.name).toLowerCase().replace(/ /g, "-");
        channel.send = async (message) => sent.push({ channel: channel.name, message });
        channel.permissionsFor = () => ({ has: () => true });
        return attach(channels, channel);
      },
      fetch: async (cid) => (cid ? channels.get(cid) ?? null : channels),
    },
    autoModerationRules: {
      fetch: async () => rules,
      create: async (o) => {
        const rule = { id: sf(), ...o };
        rules.set(rule.id, rule);
        return rule;
      },
      edit: async (rid, o) => rules.set(rid, { ...rules.get(rid), ...o }),
      delete: async (rid) => rules.delete(rid),
    },
    members: { me: { permissions: { has: (flag) => (flag === PermissionFlagsBits.ManageGuild ? manageGuild : true) } } },
    setSystemChannel: async () => {},
  };
  return guild;
}

const kindChannel = (guild, name) => [...guild.channels.cache.values()].find((c) => c.name.includes(name));

// A component, menu or modal interaction
function fakeInteraction(guild, { userId = "u1", admin: isAdminUser = true, values, fields } = {}) {
  const calls = [];
  const i = {
    calls,
    guild,
    guildId: guild.id,
    user: { id: userId },
    member: { permissions: { has: (flag) => isAdminUser && flag === PermissionFlagsBits.Administrator } },
    values,
    fields: fields ? { getTextInputValue: () => fields } : undefined,
    channel: { sent: [], send: async (m) => i.channel.sent.push(m) },
    isFromMessage: () => true,
    reply: async (p) => calls.push({ type: "reply", ...p }),
    update: async (p) => calls.push({ type: "update", ...p }),
    editReply: async (p) => calls.push({ type: "edit", ...p }),
    showModal: async (m) => calls.push({ type: "modal", modal: m }),
  };
  return i;
}

const lastWithEmbeds = (i) => [...i.calls].reverse().find((c) => c.embeds?.length);

// ---------- keyword suggestion ----------

test("the keyword suggestion picks a theme from a short description", () => {
  assert.equal(suggestTheme("nhóm bạn chơi game cuối tuần").themeId, "gaming");
  assert.equal(suggestTheme("Lớp ôn thi IELTS cho sinh viên").themeId, "hoc-tap");
  assert.equal(suggestTheme("Cộng đồng Lập Trình viên Python").themeId, "dev-code");
  assert.equal(suggestTheme("tiệm spa nhận đặt lịch khách hàng").themeId, "booking");
  assert.equal(suggestTheme("hội mê anime và manga").themeId, "anime");
  assert.deepEqual(suggestTheme("game").matched, ["game"]);
  for (const theme of themes) assert.ok(wizard.THEME_KEYWORDS[theme.id]?.length > 3, `${theme.id} has keywords`);
});

test("the suggestion falls back to a safe default and survives hostile input", () => {
  assert.deepEqual(suggestTheme("zzz qqq"), { themeId: "cong-dong", matched: [], guessed: true });
  for (const hostile of [null, undefined, 42, {}, "", "   ", "(((.*)))[", "<script>alert(1)</script>", "x".repeat(100000), "\u0000\u202e game", "__proto__ constructor"]) {
    const result = suggestTheme(hostile);
    assert.ok(themes.some((t) => t.id === result.themeId));
  }
  assert.equal(normalizeText("Đặt Lịch, KHÁCH-hàng!"), "dat lich khach hang");
  // a keyword inside a longer word does not count
  assert.equal(suggestTheme("gamelan orchestra").guessed, true);
});

// ---------- choices ----------

test("choices are cleaned and the plan gates are applied", () => {
  const start = defaultChoices();
  assert.deepEqual(start.extras, EXTRA_KEYS);

  const mixed = applyThemes(start, ["gaming", "anime", "gaming", "not-a-theme", "__proto__"], { canMix: false });
  assert.deepEqual(mixed.choices.themeIds, ["gaming"]);
  assert.match(mixed.note, /Pro/);
  assert.deepEqual(applyThemes(start, ["gaming", "anime"], { canMix: true }).choices.themeIds, ["gaming", "anime"]);
  assert.deepEqual(applyThemes(start, "gaming", { canMix: true }).choices.themeIds, []);
  assert.equal(applyThemes(start, ["a", "b", "c", "d", "e"].concat(themes.map((t) => t.id)), { canMix: true }).choices.themeIds.length, 4);

  const locked = applyHumor(start, "nham", { canPick: false });
  assert.equal(locked.choices.humor, "troll");
  assert.match(locked.note, /Pro/);
  assert.equal(applyHumor(start, "nham", { canPick: true }).choices.humor, "nham");
  assert.equal(applyHumor(start, "evil", { canPick: true }).choices.humor, "troll");

  assert.deepEqual(applyExtras(start, ["welcome", "welcome", "hack"]).extras, ["welcome"]);
  assert.equal(cleanChoices({ themeIds: [] }), null);
  assert.equal(cleanChoices(null), null);
  assert.deepEqual(cleanChoices({ themeIds: ["gaming"], humor: "evil", extras: ["x", "digest"] }), { themeIds: ["gaming"], humor: "troll", extras: ["digest"] });
});

test("a channel the admin already chose is kept, an empty or dead one is filled", () => {
  const alive = new Set(["500000000000000001"]);
  const exists = (id) => alive.has(id);
  assert.equal(pickChannel("500000000000000001", "600000000000000001", exists), "500000000000000001");
  assert.equal(pickChannel(null, "600000000000000001", exists), "600000000000000001");
  assert.equal(pickChannel("500000000000000009", "600000000000000001", exists), "600000000000000001");
  assert.equal(pickChannel(null, "not-an-id", exists), null);
  assert.equal(pickChannel(null, null, exists), null);
});

// ---------- the share card ----------

test("the result embed is a share card with both scores, a line of pride and the site", () => {
  const embed = buildResultEmbed({ before: 42, after: 91, label: "Game Thủ Cày Đêm", done: ["Dựng xong"], problems: ["AutoMod: thiếu quyền"], next: ["a", "b", "c", "d"] });
  const data = embed.toJSON();
  assert.match(data.footer.text, /https:\/\/builddiscord\.vercel\.app/);
  assert.match(data.description, /42 lên 91/);
  assert.deepEqual(data.fields.slice(0, 2).map((f) => f.name), ["Điểm trước", "Điểm sau"]);
  assert.match(data.fields[0].value, /42\/100/);
  assert.match(data.fields[1].value, /91\/100/);
  assert.match(data.fields[2].value, /✅ Dựng xong/);
  assert.match(data.fields[2].value, /⚠️ AutoMod/);
  assert.equal(data.fields[3].value.split("\n").length, 3, "only three things to try");
  assert.doesNotMatch(JSON.stringify(data), /—/);
});

test("the share card copes with missing scores and huge text", () => {
  const data = buildResultEmbed({ before: null, after: null, label: "x".repeat(5000), done: Array(200).fill("việc rất dài ".repeat(10)), problems: [], next: [] }).toJSON();
  assert.match(data.fields[0].value, /\?/);
  assert.ok(data.description.length <= 600);
  for (const field of data.fields) assert.ok(field.value.length <= 1024);
  assert.equal(prideLine(50, 50), "Server giữ 50 điểm, vừa gọn gàng vừa an toàn, thầu hài lòng.");
  assert.match(prideLine(50, 55), /Nhích/);
  assert.match(prideLine("x", 200), /một cú bấm/);
  const hostile = buildResultEmbed({ before: 10, after: 20, label: "@everyone <@1>", done: ["@here"] }).toJSON();
  assert.ok(hostile.title);
});

test("the first three things to try follow the plan and what was switched on", () => {
  const free = { rank: 0, tickets: false, games: false };
  const pro = { rank: 1, tickets: true, games: true };
  const a = nextSteps(free, { extras: ["welcome"], after: 80 });
  assert.equal(a.length, 3);
  assert.ok(a.some((s) => s.includes("/dungthu")));
  assert.ok(!a.some((s) => s.includes("/ticket")));
  assert.ok(a.some((s) => s.includes("/chaomung")));
  const b = nextSteps(pro, { extras: [], after: 100 });
  assert.ok(b.some((s) => s.includes("/ticket")));
  assert.ok(!b.some((s) => s.includes("/dungthu")));
  assert.ok(!b.some((s) => s.includes("/khamsuckhoe")));
  assert.ok(!b.some((s) => s.includes("/chaomung")));
  assert.ok(!nextSteps(free, { trialUsed: true }).some((s) => s.includes("/dungthu")));
});

// ---------- the builder and the themes ----------

test("the builder reports which channel carries each tag", async () => {
  const guild = fakeGuild();
  const first = await buildServer(guild, "gaming");
  assert.ok(first.channelsByKind.modlog && first.channelsByKind.alerts && first.channelsByKind.welcome);
  assert.equal(guild.channels.cache.get(first.channelsByKind.modlog).name, "📋・nhật-ký-phạt");
  const posts = guild.sent.length;
  const second = await buildServer(guild, "gaming");
  assert.deepEqual(second.channelsByKind, first.channelsByKind, "an existing channel is reported too");
  assert.equal(guild.sent.length, posts, "tags never cause content to be posted");
  // every theme still carries the tags through the shared parts
  for (const theme of themes) {
    const g = fakeGuild();
    const built = await buildServer(g, theme.id);
    assert.ok(built.channelsByKind.modlog, theme.id);
  }
});

// ---------- running the wizard ----------

const ALL = { themeIds: ["gaming"], humor: "troll", extras: [...EXTRA_KEYS] };

test("the wizard builds, wires the channels, switches the extras on and reports before and after", async () => {
  const guild = fakeGuild();
  const result = await runWizard(guild, ALL);

  assert.ok(guild.roles.cache.size > 0 && guild.channels.cache.size > 0);
  const modlog = kindChannel(guild, "nhật-ký-phạt").id;
  const alerts = kindChannel(guild, "mod-bàn-chuyện").id;
  assert.equal(getSection(guild.id, "automod").logChannelId, modlog);
  assert.equal(getSection(guild.id, "tickets").logChannelId, modlog);
  assert.equal(getSection(guild.id, "modlog").channelId, modlog);
  assert.equal(getSection(guild.id, "security").alertChannelId, alerts);
  assert.equal(getSection(guild.id, "digest").channelId, alerts);

  assert.equal(getSection(guild.id, "welcome").enabled, true);
  assert.equal(getSection(guild.id, "welcome").channelId, kindChannel(guild, "sảnh-chờ").id);
  assert.equal(getSection(guild.id, "automod").enabled, true);
  assert.equal(getSection(guild.id, "automod").level, "nhe");
  assert.ok(guild.rules.size > 0, "AutoMod rules were created");
  assert.equal(getSection(guild.id, "security").raidEnabled, true);
  assert.equal(getSection(guild.id, "security").nukeEnabled, false, "free plan has no nuke guard");
  assert.equal(getSection(guild.id, "modlog").enabled, true);
  assert.equal(getSection(guild.id, "digest").enabled, true);
  assert.equal(getSection(guild.id, "digest").auditWeekly, true);
  assert.deepEqual(getSection(guild.id, "setup"), { done: true, at: getSection(guild.id, "setup").at, themeIds: "gaming", humor: "troll" });
  assert.ok(getSection(guild.id, "setup").at > 0);

  assert.ok(Number.isInteger(result.before) && Number.isInteger(result.after));
  assert.deepEqual(result.problems, []);
  assert.equal(result.next.length, 3);
  const card = result.embed.toJSON();
  assert.match(card.fields[0].value, new RegExp(`${result.before}/100`));
  assert.match(card.fields[1].value, new RegExp(`${result.after}/100`));
  assert.match(card.footer.text, /builddiscord\.vercel\.app/);

  const f = funnel(0);
  assert.equal(getUsage(guild.id, "build", { lifetime: true }), 1);
  assert.ok(f.wizard_done.servers >= 1 && f.build_done.servers >= 1);
  assert.ok(f.feature_on.events >= 5);
});

test("running the wizard twice duplicates nothing and charges nothing more", async () => {
  const guild = fakeGuild();
  await runWizard(guild, ALL);
  const snapshot = () => ({ roles: guild.roles.cache.size, channels: guild.channels.cache.size, rules: guild.rules.size, sent: guild.sent.length, settings: JSON.stringify(getSection(guild.id, "automod").ruleIds) });
  const before = snapshot();
  const events = (kind) => funnel(0)[kind];
  const wizardEvents = events("wizard_done").events;
  const featureEvents = events("feature_on").events;
  const buildEvents = events("build_done").events;

  const again = await runWizard(guild, ALL);
  assert.deepEqual(snapshot(), before);
  assert.equal(getUsage(guild.id, "build", { lifetime: true }), 1);
  assert.equal(events("wizard_done").events, wizardEvents);
  assert.equal(events("feature_on").events, featureEvents);
  assert.equal(events("build_done").events, buildEvents);
  assert.match(again.done[0], /bỏ qua/);
  assert.equal(gateWizard(guild.id, cleanChoices(ALL)), null, "an identical setup is never refused for the build quota");
});

test("a channel the admin chose and a stricter AutoMod level are left alone", async () => {
  const guild = fakeGuild();
  const mine = await guild.channels.create({ name: "log-cua-toi", type: ChannelType.GuildText });
  patchSection(guild.id, "automod", { enabled: true, level: "gat", logChannelId: mine.id });
  patchSection(guild.id, "modlog", { channelId: mine.id });
  await runWizard(guild, { ...ALL, extras: ["automod"] });
  assert.equal(getSection(guild.id, "automod").logChannelId, mine.id);
  assert.equal(getSection(guild.id, "modlog").channelId, mine.id);
  assert.equal(getSection(guild.id, "automod").level, "gat");
  assert.equal(getSection(guild.id, "welcome").enabled, false, "an extra that was not chosen stays off");
  assert.equal(getSection(guild.id, "security").raidEnabled, false);
});

test("a dead log channel id is replaced", async () => {
  const guild = fakeGuild();
  patchSection(guild.id, "digest", { channelId: "100000000000000001" });
  await runWizard(guild, { ...ALL, extras: [] });
  assert.equal(getSection(guild.id, "digest").channelId, kindChannel(guild, "mod-bàn-chuyện").id);
  assert.equal(getSection(guild.id, "digest").enabled, false);
});

test("a missing AutoMod permission is reported and nothing is left half switched on", async () => {
  const guild = fakeGuild({ manageGuild: false });
  const result = await runWizard(guild, { ...ALL, extras: ["automod", "welcome"] });
  assert.ok(result.problems.some((p) => /Quản lý server/.test(p)));
  assert.equal(getSection(guild.id, "automod").enabled, false);
  assert.equal(guild.rules.size, 0);
  assert.equal(getSection(guild.id, "welcome").enabled, true, "the other extras still ran");
  assert.ok(result.done.some((d) => /Chào người mới/.test(d)));
});

test("a failing health check or extra does not break the setup", async () => {
  const guild = fakeGuild();
  const result = await runWizard(guild, ALL, {
    deps: {
      audit: async () => {
        throw new Error("boom");
      },
      sync: async () => {
        throw new Error("rules exploded");
      },
    },
  });
  assert.equal(result.before, null);
  assert.equal(result.after, null);
  assert.ok(result.problems.some((p) => /AutoMod/.test(p)));
  assert.equal(getSection(guild.id, "setup").done, true);
  assert.match(result.embed.toJSON().fields[0].value, /\?/);
});

test("a build that throws is reported to the caller and the setup is not marked done", async () => {
  const guild = fakeGuild();
  await assert.rejects(runWizard(guild, ALL, { deps: { build: async () => { throw new Error("Discord said no"); } } }), /Discord said no/);
  assert.equal(getSection(guild.id, "setup").done, false);
  await assert.rejects(runWizard(guild, { themeIds: [] }), /No theme/);
});

test("plan gating: the free build quota, mixing, humor and the nuke guard", async () => {
  const free = fakeGuild();
  const nham = cleanChoices({ themeIds: ["gaming"], humor: "nham" });
  assert.match(gateWizard(free.id, nham), /Pro/);
  assert.equal(gateWizard(free.id, cleanChoices({ themeIds: ["gaming"] })), null);
  assert.match(gateWizard(free.id, cleanChoices({ themeIds: ["gaming", "anime"] })), /Pro/);

  await runWizard(free, { ...ALL, extras: [] });
  await runWizard(free, { ...ALL, themeIds: ["anime"], extras: [] });
  assert.equal(getUsage(free.id, "build", { lifetime: true }), 2);
  assert.match(gateWizard(free.id, cleanChoices({ themeIds: ["hoc-tap"] })), /2 lần/);
  assert.equal(gateWizard(free.id, cleanChoices({ themeIds: ["anime"] })), null, "the build that was already made is not charged again");

  const pro = fakeGuild();
  grant(pro.id, "pro", 30);
  assert.equal(gateWizard(pro.id, cleanChoices({ themeIds: ["gaming", "anime"], humor: "nham" })), null);
  await runWizard(pro, { themeIds: ["gaming", "anime"], humor: "nham", extras: ["security"] });
  assert.equal(getSection(pro.id, "security").nukeEnabled, true);
  assert.equal(getSection(pro.id, "setup").themeIds, "gaming+anime");
  assert.equal(getSection(pro.id, "setup").humor, "nham");
});

// ---------- the command and its components ----------

test("/batdau opens the wizard for an admin and refuses everyone else", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild);
  await batdau.execute(i);
  const view = i.calls[0];
  assert.equal(view.components.length, 4);
  for (const row of view.components.slice(0, 3)) assert.match(row.toJSON().components[0].custom_id, /^batdau:(theme|humor|extras):u1$/);
  const themeMenu = view.components[0].toJSON().components[0];
  assert.equal(themeMenu.options.length, themes.length + 1, "every theme plus the suggest option");
  assert.equal(themeMenu.max_values, 1, "a free plan picks one theme");
  assert.ok(themeMenu.options.some((o) => o.value === wizard.SUGGEST));
  assert.equal(view.components[3].toJSON().components[0].disabled, true, "the build button waits for a theme");

  const stranger = fakeInteraction(guild, { admin: false });
  await batdau.execute(stranger);
  assert.equal(stranger.calls[0].components, undefined);
  assert.ok(stranger.calls[0].content);
  assert.equal(batdau.data.toJSON().default_member_permissions, String(PermissionFlagsBits.Administrator));
});

test("the guided flow: pick, suggest, confirm, show the card, share it once", async () => {
  const guild = fakeGuild();
  await batdau.execute(fakeInteraction(guild));
  const click = async (action, options) => {
    const i = fakeInteraction(guild, options);
    await batdau.handleComponent(i, [action, "u1"]);
    return i;
  };

  const pickedTheme = await click("theme", { values: ["gaming", "anime"] });
  assert.match(lastWithEmbeds(pickedTheme).embeds[0].data.description, /Pro/, "a free server is told mixing is locked");
  assert.match(lastWithEmbeds(pickedTheme).embeds[0].data.description, /Game Thủ/);

  const modal = await click("theme", { values: [wizard.SUGGEST] });
  assert.equal(modal.calls[0].type, "modal");
  assert.equal(modal.calls[0].modal.toJSON().custom_id, "batdau:desc:u1");

  const described = await click("desc", { fields: "nhóm bạn mê anime và manga" });
  assert.match(lastWithEmbeds(described).embeds[0].data.description, /Anime/i);

  const humorTry = await click("humor", { values: ["nham"] });
  assert.match(lastWithEmbeds(humorTry).embeds[0].data.description, /Pro/);
  assert.match(lastWithEmbeds(humorTry).embeds[0].data.description, /Giọng điệu:\*\* Troll/);

  const extras = await click("extras", { values: ["welcome", "security"] });
  assert.match(lastWithEmbeds(extras).embeds[0].data.description, /Chào người mới, Bảo vệ cơ bản/);

  const go = await click("go");
  assert.equal(lock.tryAcquire(guild.id), true, "the build lock was released");
  lock.release(guild.id);
  const card = lastWithEmbeds(go);
  assert.equal(card.embeds[0].data.title, "🏗️ Server đã được thầu dựng xong");
  assert.match(card.embeds[0].data.footer.text, /builddiscord\.vercel\.app/);
  const ids = card.components[0].toJSON().components.map((c) => c.custom_id ?? c.url);
  assert.deepEqual(ids, ["batdau:share:u1", "https://builddiscord.vercel.app"]);
  assert.equal(getSection(guild.id, "setup").themeIds, "anime");

  const shared = await click("share");
  assert.equal(shared.channel.sent.length, 1);
  assert.deepEqual(shared.channel.sent[0].allowedMentions, { parse: [] });
  assert.equal(shared.calls[0].components[0].toJSON().components.length, 1, "the share button is gone");
  const again = await click("share");
  assert.equal(again.channel.sent.length, 0);
});

test("components are authorised again on every use", async () => {
  const guild = fakeGuild();
  await batdau.execute(fakeInteraction(guild));

  const notAdmin = fakeInteraction(guild, { admin: false, values: ["gaming"] });
  await batdau.handleComponent(notAdmin, ["theme", "u1"]);
  assert.match(notAdmin.calls[0].content, /admin/);

  const otherAdmin = fakeInteraction(guild, { userId: "u2", values: ["gaming"] });
  await batdau.handleComponent(otherAdmin, ["theme", "u1"]);
  assert.equal(otherAdmin.calls[0].type, "reply");
  assert.match(otherAdmin.calls[0].content, /hết hạn/);

  const forged = fakeInteraction(guild, { userId: "u9" });
  await batdau.handleComponent(forged, ["go", "u9"]);
  assert.match(forged.calls[0].content, /hết hạn/, "no session, no build");
  assert.equal(guild.roles.cache.size, 0);

  const noTheme = fakeInteraction(guild);
  await batdau.handleComponent(noTheme, ["go", "u1"]);
  assert.match(lastWithEmbeds(noTheme).embeds[0].data.description, /Chưa chọn kiểu/);
  assert.equal(guild.roles.cache.size, 0);

  const open = fakeInteraction(guild, { admin: false });
  await batdau.handleComponent(open, ["open"]);
  assert.match(open.calls[0].content, /admin/);

  const cancel = fakeInteraction(guild);
  await batdau.handleComponent(cancel, ["no", "u1"]);
  assert.match(cancel.calls[0].content, /huỷ/);
  const afterCancel = fakeInteraction(guild);
  await batdau.handleComponent(afterCancel, ["go", "u1"]);
  assert.match(afterCancel.calls[0].content, /hết hạn/);
});

test("the confirm button respects the humor gate, the bot permissions and the build lock", async () => {
  const guild = fakeGuild();
  await batdau.execute(fakeInteraction(guild));
  const select = async (action, values) => batdau.handleComponent(fakeInteraction(guild, { values }), [action, "u1"]);
  await select("theme", ["gaming"]);

  guild.members.me.permissions.has = () => false;
  const noPerms = fakeInteraction(guild);
  await batdau.handleComponent(noPerms, ["go", "u1"]);
  assert.match(lastWithEmbeds(noPerms).embeds[0].data.description, /Quản lý/);
  assert.equal(guild.roles.cache.size, 0);
  guild.members.me.permissions.has = () => true;

  assert.equal(lock.tryAcquire(guild.id), true);
  const busy = fakeInteraction(guild);
  await batdau.handleComponent(busy, ["go", "u1"]);
  assert.match(busy.calls[0].content, /thi công/);
  assert.equal(guild.roles.cache.size, 0);
  lock.release(guild.id);
});

// ---------- guildCreate ----------

function inviteGuild({ systemWritable = true, joined = Date.now() } = {}) {
  const posts = [];
  const mkChannel = (id, canSend) => ({ id, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => canSend }), send: async (m) => posts.push({ id, ...m }) });
  const system = mkChannel("sys", systemWritable);
  const other = mkChannel("other", true);
  const quiet = mkChannel("quiet", false);
  return { id: sf(), joinedTimestamp: joined, systemChannel: system, channels: { cache: new Collection([["quiet", quiet], ["other", other]]) }, members: { me: {} }, posts };
}

test("joining a server posts one message with the start button and counts the invite", async () => {
  const guild = inviteGuild();
  await guildCreate.execute({}, guild);
  assert.equal(guild.posts.length, 1);
  assert.equal(guild.posts[0].id, "sys");
  assert.equal(guild.posts[0].components[0].toJSON().components[0].custom_id, "batdau:open");
  assert.deepEqual(guild.posts[0].allowedMentions, { parse: [] });
  assert.ok(guild.posts[0].content.includes("/build") || guild.posts[0].content.length > 10);
  assert.equal(funnel(0).invite.servers >= 1, true);

  const fallback = inviteGuild({ systemWritable: false });
  await guildCreate.execute({}, fallback);
  assert.equal(fallback.posts[0].id, "other", "the first channel the bot can write in");
});

test("an old guild that comes back after an outage is not welcomed or counted again", async () => {
  const guild = inviteGuild({ joined: Date.now() - 24 * 60 * 60 * 1000 });
  const before = funnel(0).invite?.events ?? 0;
  await guildCreate.execute({}, guild);
  assert.equal(guild.posts.length, 0);
  assert.equal(funnel(0).invite?.events ?? 0, before);
  const broken = inviteGuild();
  broken.systemChannel.send = async () => {
    throw new Error("Missing Access");
  };
  await assert.doesNotReject(guildCreate.execute({}, broken));
});

test("the start button opens the wizard for an admin only", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild, { userId: "boss" });
  await batdau.handleComponent(i, ["open"]);
  assert.equal(i.calls[0].components.length, 4);
  assert.ok(wizard.getSession(guild.id, "boss"));
});

// ---------- /trogiup ----------

const helpText = (embed) => embed.toJSON().fields.map((f) => `${f.name}\n${f.value}`).join("\n");

test("/trogiup groups the commands and marks what the plan locks", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild);
  i.client = { commands: new Collection() };
  await trogiup.execute(i);
  const reply = i.calls[0];
  const text = helpText(reply.embeds[0]);
  for (const title of ["Dựng server", "Bảo vệ", "Giữ server sôi động", "Gói và thanh toán"]) assert.match(text, new RegExp(title));
  assert.match(text, /Bắt đầu trong ba dòng/);
  assert.match(text, /🔒 `\/ticket`.*gói Pro/);
  assert.match(text, /🔒 `\/diemdanh`.*gói Pro/);
  assert.match(text, /`\/batdau`/);
  assert.doesNotMatch(text, /🔒 `\/batdau`/);
  assert.match(text, /trộn nhiều theme: gói Pro/);
  assert.equal(reply.components[0].toJSON().components[0].url, "https://github.com/nhaajtt/buildDISCORD/blob/main/docs/so-tay.md");
  assert.equal(reply.flags !== undefined, true);
  assert.doesNotMatch(JSON.stringify(reply.embeds[0].toJSON()), /—/);
});

test("/trogiup shows paid commands as open on a paid plan and lists commands it does not know, but not owner tools", async () => {
  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  const i = fakeInteraction(guild);
  const commands = new Collection();
  commands.set("moi", { data: { toJSON: () => ({ name: "moi", description: "Lệnh mới" }) } });
  commands.set("admin", admin);
  commands.set("trogiup", trogiup);
  commands.set("build", { data: { toJSON: () => ({ name: "build", description: "x" }) } });
  i.client = { commands };
  await trogiup.execute(i);
  const text = helpText(i.calls[0].embeds[0]);
  assert.doesNotMatch(text, /🔒/);
  assert.match(text, /`\/moi` Lệnh mới/);
  assert.doesNotMatch(text, /`\/admin`/);
  assert.equal((text.match(/`\/build`/g) ?? []).length, 1);
  for (const field of i.calls[0].embeds[0].toJSON().fields) assert.ok(field.value.length <= 1024);
});

// ---------- /goi ----------

test("/goi lists the new flags, counts and prices", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild);
  await goi.execute(i);
  const text = i.calls[0].embeds[0].data.description;
  for (const piece of ["bảo vệ chống raid", "chống xoá hàng loạt", "điểm hoạt động", "giveaway", "bản tin tuần", "trợ lý AI", "menu role 3", "menu role 10", "menu role 25"]) assert.ok(text.includes(piece), piece);
  assert.match(text, /3,99/);
  assert.match(text, /7,99/);
  assert.match(text, /4,99/);
  assert.match(text, /10 tháng/);
  assert.match(text, /\/dungthu/);
  assert.match(text, /7 ngày/);
  assert.doesNotMatch(text, /—/);
  assert.ok(text.length <= 4000);
});

// ---------- /admin thongke ----------

test("/admin thongke shows the 30 day funnel with conversion percentages", async () => {
  const day = 24 * 60 * 60 * 1000;
  const guilds = ["f1", "f2", "f3", "f4"].map((x) => `${x}-${sf()}`);
  // numbers are asserted as deltas so other tests' events do not matter
  const base = funnel(Date.now() - 30 * day);
  for (const g of guilds) track(g, "invite");
  track(guilds[0], "wizard_done");
  track(guilds[1], "wizard_done");
  track(guilds[0], "build_done");
  track(guilds[0], "trial");
  track("ancient", "invite", Date.now() - 90 * day);

  const embed = funnelEmbed({ invite: { servers: 4 }, wizard_done: { servers: 2 }, build_done: { servers: 1 }, trial: { servers: 1 }, paid: { servers: 0 }, feature_on: { events: 7 } }).toJSON();
  assert.match(embed.description, /Mời bot vào server:\*\* 4/);
  assert.match(embed.description, /Chạy xong \/batdau:\*\* 2, 50%/);
  assert.match(embed.description, /Dựng server xong:\*\* 1, 25%/);
  assert.match(embed.description, /Trả tiền:\*\* 0, 0%/);
  assert.match(embed.description, /7 lần/);

  const i = fakeInteraction(fakeGuild());
  i.user = { id: "owner-1" };
  i.client = { guilds: { cache: new Collection([["a", {}]]) } };
  i.options = { getSubcommand: () => "thongke" };
  await admin.execute(i);
  const reply = i.calls[0];
  assert.match(reply.content, /1 server/);
  assert.equal(reply.embeds.length, 1);
  assert.match(reply.embeds[0].data.title, /30 ngày/);
  const live = funnel(Date.now() - 30 * day);
  assert.equal(live.invite.servers - (base.invite?.servers ?? 0), 4, "the 90 day old invite is outside the window");
  assert.match(reply.embeds[0].data.description, new RegExp(`Mời bot vào server:\\*\\* ${live.invite.servers}`));

  const empty = funnelEmbed({}).toJSON();
  assert.match(empty.description, /chưa có server nào được mời/);
  assert.doesNotThrow(() => funnelEmbed(null));
});

test("/admin thongke is for the bot owner only", async () => {
  const i = fakeInteraction(fakeGuild());
  i.client = { guilds: { cache: new Collection() } };
  i.options = { getSubcommand: () => "thongke" };
  await admin.execute(i);
  assert.equal(i.calls[0].embeds, undefined);
  assert.match(i.calls[0].content, /chủ bot/);
});

test("the wizard tracks a trial that was used so it stops suggesting one", async () => {
  const guild = fakeGuild();
  startTrial(guild.id);
  const result = await runWizard(guild, { ...ALL, extras: [] });
  assert.ok(!result.next.some((s) => s.includes("/dungthu")));
});
