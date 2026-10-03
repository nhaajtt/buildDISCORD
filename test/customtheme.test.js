import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Collection, ChannelType } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "customtheme-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";

const custom = await import("../src/themes/custom.js");
const { extractCustomTheme, sanitizeCustomTheme, composeCustom, saveCustomTheme, getCustomTheme, listCustomThemes, deleteCustomTheme, countCustomThemes, gateSave, normalizeThemeName, exportCustomTheme, parseThemeFile, FILE_MAX_BYTES } = custom;
const { DesignError } = await import("../src/ai/validate.js");
const { buildPlan, countPlan } = await import("../src/themes/index.js");
const { baseRules } = await import("../src/themes/base.js");
const { addChannel, createBlueprint, getBlueprint, removeCategory, renameCategory } = await import("../src/blueprints.js");
const { editorView, handleBlueprint } = await import("../src/ui/editor.js");
const { getDb } = await import("../src/db.js");
const { grant } = await import("../src/license.js");
const themeCommand = (await import("../src/commands/theme.js")).default;

let n = 0;
const newGuildId = () => `8000000000000${String(++n).padStart(4, "0")}`;

// What the website and the editor show of a plan, without the fields that are bookkeeping
const project = (plan) => ({
  welcome: plan.welcome,
  rules: plan.rules,
  roles: plan.roles.map((r) => ({ name: r.name, color: r.color, pick: r.pick === true })),
  categories: plan.categories.map((c) => ({
    name: c.name,
    channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type, topic: ch.topic ?? null, readonly: Boolean(ch.readonly), kind: ch.kind ?? null })),
  })),
  counts: countPlan(plan),
});

// ---------------------------------------------------------------- extracting and composing

test("a blueprint with edits becomes a saved theme and composes back into the same plan", () => {
  const plan = buildPlan(["gaming", "anime"]);
  assert.ok(renameCategory(plan, 1, "🎮 Khu Của Tôi"));
  assert.ok(addChannel(plan, "Phòng Họp Kín", "voice").ok);
  assert.ok(addChannel(plan, "Kênh Mới Toanh", "text").ok);
  assert.ok(removeCategory(plan, 2));

  const theme = extractCustomTheme(plan);
  assert.equal(theme.id, "custom");
  assert.ok(theme.roles.length > 0 && theme.roles.every((r) => r.key.startsWith("cu-")));
  assert.ok(!theme.categories.some((c) => ["📌 Khu Hành Chính", "🎧 Phòng Thu Âm Dở Hơi", "🔒 Hậu Trường Của Mod"].includes(c.name)), "the shared categories are not saved");
  assert.equal(theme.extraRules.length, plan.rules.length - baseRules.length);

  const composed = composeCustom(theme);
  assert.equal(composed.id, "custom");
  assert.deepEqual(project(composed), project(plan));
});

test("the shared parts always come back, whatever a saved theme holds", () => {
  const composed = composeCustom({ categories: [{ name: "Của Tôi", channels: [{ name: "chat", type: "text" }] }] });
  const kinds = composed.categories.flatMap((c) => c.channels.map((ch) => ch.kind)).filter(Boolean);
  for (const kind of ["rules", "welcome", "roles", "dj", "tts"]) assert.ok(kinds.includes(kind), kind);
  assert.equal(composed.categories[0].name, "📌 Khu Hành Chính");
  assert.ok(composed.roles.some((r) => r.key === "boss") && composed.roles.some((r) => r.key === "mod"));
});

test("a blueprint with nothing of its own left has nothing to save", () => {
  const plan = buildPlan("gaming");
  while (removeCategory(plan, plan.categories.findIndex((c) => !["📌 Khu Hành Chính", "🎧 Phòng Thu Âm Dở Hơi", "🔒 Hậu Trường Của Mod"].includes(c.name)))) {
    // keep removing the themed categories until only the shared ones are left
  }
  assert.throws(() => extractCustomTheme(plan), DesignError);
});

// ---------------------------------------------------------------- strict rebuild of anything loaded

test("a saved theme can never carry permissions or a self-assignable role it did not ask for", () => {
  const theme = sanitizeCustomTheme({
    roles: [
      { name: "Sếp", color: "#ff0000", perms: ["Administrator"], permissions: 8, hoist: true, pick: "yes" },
      { name: "Dân Thường", color: 123456, pick: true },
      { name: "Sếp", color: 1, pick: true },
      { name: "Màu Lạ", color: "đỏ", pick: false },
    ],
    categories: [{ name: "Khu", channels: [{ name: "chat", type: "text" }] }],
  });
  assert.deepEqual(theme.roles.map((r) => r.name), ["Sếp", "Dân Thường", "Màu Lạ"], "a repeated name is dropped");
  for (const role of theme.roles) {
    assert.deepEqual(Object.keys(role).sort(), ["color", "key", "name", "pick"]);
  }
  assert.equal(theme.roles[0].pick, false, "pick has to be exactly true");
  assert.equal(theme.roles[0].color, 0xff0000);
  assert.equal(theme.roles[1].pick, true);
  assert.equal(theme.roles[1].color, 123456, "an integer color is kept");
  assert.ok(theme.roles[2].color > 0, "an unusable color falls back to the palette");
});

test("hostile input is rejected or cut down, never trusted", () => {
  for (const raw of [null, undefined, "x", 5, [], true]) assert.throws(() => sanitizeCustomTheme(raw), DesignError);
  assert.throws(() => sanitizeCustomTheme({ categories: [] }), DesignError);
  assert.throws(() => sanitizeCustomTheme({ categories: [{ name: "Khu", channels: [] }] }), DesignError);
  assert.throws(() => sanitizeCustomTheme({ categories: [{ name: "fuck", channels: [{ name: "chat", type: "text" }] }] }), DesignError);

  const huge = sanitizeCustomTheme({
    roles: Array.from({ length: 5000 }, (_, i) => ({ name: `r${i}` })),
    extraRules: Array.from({ length: 5000 }, (_, i) => `luật ${i}`),
    categories: Array.from({ length: 5000 }, (_, i) => ({
      name: `k${i}`,
      channels: Array.from({ length: 5000 }, (_, j) => ({ name: `c${i}-${j}`, type: "text" })),
    })),
  });
  assert.ok(huge.roles.length <= 40);
  assert.ok(huge.extraRules.length <= 30);
  assert.ok(huge.categories.length <= 25);
  assert.ok(huge.categories.every((c) => c.channels.length <= 50));
  assert.ok(huge.categories.reduce((total, c) => total + c.channels.length, 0) <= 300);

  const messy = sanitizeCustomTheme({
    label: "@everyone Bản <@123> Đẹp",
    welcome: "xin chào cả nhà",
    evil: "x".repeat(10_000),
    categories: [
      {
        name: "Khu <#456> Tốt",
        staff: true,
        channels: [
          { name: "Chat Chung", type: "text", topic: "ping @here đi", kind: "rules", readonly: "yes" },
          { name: "chat-chung", type: "text" },
          { name: "đụ má", type: "text" },
          { name: "Phòng Họp", type: "voice", topic: "không có topic cho voice", readonly: true },
          { name: "Thông Báo", type: "text", readonly: true },
        ],
      },
    ],
  });
  assert.equal(messy.label, "Bản Đẹp");
  assert.equal(messy.welcome, "Chào {user}! xin chào cả nhà");
  assert.equal("evil" in messy, false);
  assert.equal(messy.categories[0].name, "Khu Tốt");
  assert.equal("staff" in messy.categories[0], false);
  const channels = messy.categories[0].channels;
  assert.deepEqual(channels.map((c) => c.name), ["chat-chung", "Phòng Họp", "thông-báo"], "duplicates and blocked words are dropped, text names are normalized");
  assert.equal(channels[0].topic, "ping đi");
  assert.equal("kind" in channels[0], false, "a saved theme cannot claim to be the rules channel");
  assert.equal("readonly" in channels[0], false, "readonly has to be exactly true");
  assert.equal("topic" in channels[1], false);
  assert.equal("readonly" in channels[1], false, "voice channels are never read-only");
  assert.equal(channels[2].readonly, true);
});

test("sanitizing twice changes nothing", () => {
  const once = extractCustomTheme(buildPlan(["booking", "dev-code"]));
  assert.deepEqual(sanitizeCustomTheme(once), once);
  assert.deepEqual(sanitizeCustomTheme(JSON.parse(JSON.stringify(once))), once);
});

// ---------------------------------------------------------------- storage, plan limits, replacing

test("saved themes follow the plan: none on free, three on Pro, ten on Plus, and a name can always be replaced", () => {
  const guild = newGuildId();
  const theme = extractCustomTheme(buildPlan("anime"));
  assert.match(gateSave(guild, "Một"), /Pro/);

  grant(guild, "pro", 30);
  for (const name of ["Một", "Hai", "Ba"]) {
    assert.equal(gateSave(guild, name), null);
    assert.deepEqual(saveCustomTheme(guild, name, theme), { replaced: false });
  }
  assert.equal(countCustomThemes(guild), 3);
  assert.match(gateSave(guild, "Bốn"), /3/, "the fourth is refused");
  assert.equal(gateSave(guild, "hai"), null, "replacing needs no free slot, whatever the case");
  assert.deepEqual(saveCustomTheme(guild, "HAI", { ...theme, label: "Bản Mới" }), { replaced: true });
  assert.equal(countCustomThemes(guild), 3);
  assert.equal(getCustomTheme(guild, "hai").name, "HAI");
  assert.equal(getCustomTheme(guild, "hai").theme.label, "Bản Mới");

  assert.equal(getCustomTheme(newGuildId(), "Một"), null, "another server cannot read it");
  assert.deepEqual(listCustomThemes(guild).map((t) => t.name).sort(), ["Ba", "HAI", "Một"]);
  assert.equal(deleteCustomTheme(guild, "ba"), 1);
  assert.equal(countCustomThemes(guild), 2);
  assert.equal(gateSave(guild, "Bốn"), null);

  grant(guild, "plus", 30);
  for (let i = 0; i < 8; i++) saveCustomTheme(guild, `Plus ${i}`, theme);
  assert.equal(countCustomThemes(guild), 10);
  assert.match(gateSave(guild, "Mười một"), /10/);
});

test("theme names are 1 to 40 characters", () => {
  assert.equal(normalizeThemeName("  Hội   mới  "), "Hội mới");
  assert.equal(normalizeThemeName(""), null);
  assert.equal(normalizeThemeName("x".repeat(41)), null);
  assert.equal(normalizeThemeName("x".repeat(40)), "x".repeat(40));
});

test("a row in the database is rebuilt strictly when loaded, and a damaged row does not break the list", () => {
  const guild = newGuildId();
  const db = getDb();
  const insert = db.prepare("INSERT INTO custom_themes (guild_id, name, theme, created_at) VALUES (?, ?, ?, ?)");
  insert.run(guild, "Độc", JSON.stringify({ roles: [{ name: "Sếp", perms: ["Administrator"], pick: true }], categories: [{ name: "Khu", channels: [{ name: "chat", type: "text", kind: "rules" }] }], extra: 1 }), 1);
  insert.run(guild, "Hỏng", "{not json", 2);
  insert.run(guild, "Rỗng", JSON.stringify({ categories: [] }), 3);

  const loaded = getCustomTheme(guild, "Độc").theme;
  assert.equal("perms" in loaded.roles[0], false);
  assert.equal("kind" in loaded.categories[0].channels[0], false);
  assert.throws(() => getCustomTheme(guild, "Hỏng"), SyntaxError);
  assert.throws(() => getCustomTheme(guild, "Rỗng"), DesignError);
  assert.deepEqual(listCustomThemes(guild).map((t) => t.name).sort(), ["Hỏng", "Rỗng", "Độc"], "unreadable rows are still listed so they can be deleted");
});

// ---------------------------------------------------------------- export and import

test("exporting a theme and importing the file gives the same theme back", () => {
  const theme = extractCustomTheme(buildPlan(["booking", "thu-cung"]));
  const file = exportCustomTheme("Tiệm Của Tôi", theme);
  assert.ok(Buffer.byteLength(file) < FILE_MAX_BYTES);
  const imported = parseThemeFile(file);
  assert.equal(imported.name, "Tiệm Của Tôi");
  assert.deepEqual(imported.theme, theme);
  assert.deepEqual(composeCustom(imported.theme).categories.map((c) => c.name), composeCustom(theme).categories.map((c) => c.name));
});

test("theme files that are too big, not JSON, or not theme files are refused", () => {
  assert.throws(() => parseThemeFile("x".repeat(FILE_MAX_BYTES + 1)), DesignError);
  assert.throws(() => parseThemeFile("{nope"), DesignError);
  assert.throws(() => parseThemeFile("[]"), DesignError);
  assert.throws(() => parseThemeFile(JSON.stringify({ kind: "something-else", version: 1, theme: {} })), DesignError);
  assert.throws(() => parseThemeFile(JSON.stringify({ kind: "thau-theme", version: 2, theme: {} })), DesignError);
  assert.throws(() => parseThemeFile(JSON.stringify({ kind: "thau-theme", version: 1, theme: { categories: [] } })), DesignError);
});

// ---------------------------------------------------------------- the editor

const customIds = (view) => view.components.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));

test("the editor keeps every button and menu it had and adds one to save the theme", () => {
  const plan = buildPlan("gaming");
  const id = createBlueprint({ guildId: "g", userId: "u", plan });
  const view = editorView(getBlueprint(id));
  const ids = customIds(view);
  for (const action of ["remove", "rename", "add", "go", "no"]) assert.ok(ids.includes(`bp:${action}:${id}`), `bp:${action} is still there`);
  assert.ok(ids.includes(`bp:save:${id}`));
  assert.equal(ids.length, 6);

  const buttons = view.components.at(-1).toJSON().components;
  assert.ok(buttons.length <= 5, "a row holds at most five buttons");
  assert.deepEqual(buttons.map((b) => b.label), ["Thêm kênh", "Lưu thành theme riêng", "Xây luôn đại ca", "Để tui nghĩ lại"]);
  assert.ok(view.components.length <= 5);
});

function editorInteraction({ guildId, userId = "admin1", name }) {
  const sent = { updates: [], replies: [], modals: [] };
  return {
    sent,
    guildId,
    user: { id: userId },
    member: { permissions: { has: () => true } },
    fields: { getTextInputValue: () => name },
    isFromMessage: () => true,
    update: async (view) => sent.updates.push(view),
    reply: async (payload) => sent.replies.push(payload),
    showModal: async (modal) => sent.modals.push(modal),
  };
}

test("the save button asks for a name, saves the custom part, replaces by name and respects the plan", async () => {
  const guildId = newGuildId();
  const plan = buildPlan(["gaming", "anime"]);
  const id = createBlueprint({ guildId, userId: "admin1", plan });
  const note = (interaction) => interaction.sent.updates.at(-1).embeds[0].toJSON().description;

  // A free server hears right away that saved themes are a paid feature, and no modal opens
  const free = editorInteraction({ guildId });
  await handleBlueprint(free, ["save", id]);
  assert.match(free.sent.replies[0].content, /Pro/);
  assert.equal(free.sent.modals.length, 0);

  grant(guildId, "pro", 30);
  const press = editorInteraction({ guildId });
  await handleBlueprint(press, ["save", id]);
  assert.equal(press.sent.modals.length, 1);
  assert.equal(press.sent.modals[0].toJSON().custom_id, `bp:savem:${id}`);
  assert.equal(press.sent.modals[0].toJSON().components[0].components[0].max_length, 40);

  const first = editorInteraction({ guildId, name: "  Hội   Của Tôi " });
  await handleBlueprint(first, ["savem", id]);
  assert.match(note(first), /Đã lưu theme riêng \*\*Hội Của Tôi\*\*/);
  assert.deepEqual(getCustomTheme(guildId, "Hội Của Tôi").theme, extractCustomTheme(plan));

  const again = editorInteraction({ guildId, name: "hội của tôi" });
  await handleBlueprint(again, ["savem", id]);
  assert.match(note(again), /Đã ghi đè/);
  assert.equal(countCustomThemes(guildId), 1);

  for (const name of ["Hai", "Ba"]) await handleBlueprint(editorInteraction({ guildId, name }), ["savem", id]);
  const full = editorInteraction({ guildId, name: "Bốn" });
  await handleBlueprint(full, ["savem", id]);
  assert.match(note(full), /3/);
  assert.equal(countCustomThemes(guildId), 3);

  const badName = editorInteraction({ guildId, name: "   " });
  await handleBlueprint(badName, ["savem", id]);
  assert.match(note(badName), /1 đến 40/);

  // Someone else cannot save from this blueprint
  const stranger = editorInteraction({ guildId, userId: "other", name: "Lạ" });
  await handleBlueprint(stranger, ["savem", id]);
  assert.match(stranger.sent.replies[0].content, /của người khác/);
});

test("a blueprint with nothing of its own says so instead of saving an empty theme", async () => {
  const guildId = newGuildId();
  grant(guildId, "pro", 30);
  const plan = buildPlan("gaming");
  plan.categories = plan.categories.filter((c) => ["📌 Khu Hành Chính", "🎧 Phòng Thu Âm Dở Hơi", "🔒 Hậu Trường Của Mod"].includes(c.name));
  const id = createBlueprint({ guildId, userId: "admin1", plan });
  const interaction = editorInteraction({ guildId, name: "Trống" });
  await handleBlueprint(interaction, ["savem", id]);
  assert.match(interaction.sent.updates.at(-1).embeds[0].toJSON().description, /không còn gì riêng/);
  assert.equal(countCustomThemes(guildId), 0);
});

// ---------------------------------------------------------------- the /theme command

function fakeGuild(id) {
  return { id, members: { me: { permissions: { has: () => true } } }, roles: { cache: new Collection() }, channels: { cache: new Collection() } };
}

function themeInteraction({ guildId, sub, strings = {}, attachment = null, userId = "admin1", admin = true, focused = "" }) {
  const sent = { replies: [], updates: [], edits: [], responds: null };
  return {
    sent,
    guild: fakeGuild(guildId),
    guildId,
    user: { id: userId },
    member: { permissions: { has: () => admin } },
    options: { getSubcommand: () => sub, getString: (k) => strings[k] ?? null, getAttachment: () => attachment, getFocused: () => focused },
    reply: async (p) => sent.replies.push(p),
    update: async (p) => sent.updates.push(p),
    deferReply: async () => {},
    editReply: async (p) => sent.edits.push(typeof p === "string" ? { content: p } : p),
    respond: async (c) => (sent.responds = c),
  };
}

test("/theme lists, uses, exports, imports and deletes saved themes", async () => {
  const guildId = newGuildId();
  const theme = extractCustomTheme(buildPlan("creator"));

  const none = themeInteraction({ guildId, sub: "danhsach" });
  await themeCommand.execute(none);
  assert.match(none.sent.replies[0].content, /Chưa lưu theme riêng nào/);

  grant(guildId, "pro", 30);
  saveCustomTheme(guildId, "Studio Của Tôi", theme);

  const list = themeInteraction({ guildId, sub: "danhsach" });
  await themeCommand.execute(list);
  assert.match(list.sent.replies[0].embeds[0].toJSON().description, /Studio Của Tôi/);

  const auto = themeInteraction({ guildId, sub: "dung", focused: "studio" });
  await themeCommand.autocomplete(auto);
  assert.deepEqual(auto.sent.responds, [{ name: "Studio Của Tôi", value: "Studio Của Tôi" }]);
  const nobody = themeInteraction({ guildId, sub: "dung", admin: false, focused: "" });
  await themeCommand.autocomplete(nobody);
  assert.deepEqual(nobody.sent.responds, [], "only admins see the names");

  const use = themeInteraction({ guildId, sub: "dung", strings: { ten: "studio của tôi" } });
  await themeCommand.execute(use);
  const opened = use.sent.replies[0];
  assert.match(opened.embeds[0].toJSON().description, /Theme riêng \*\*Studio Của Tôi\*\*/);
  assert.ok(customIds(opened).some((i) => i.startsWith("bp:go:")), "the blueprint editor opens");
  assert.match(opened.embeds[0].toJSON().title, /Studio/);

  const missing = themeInteraction({ guildId, sub: "dung", strings: { ten: "Không Có" } });
  await themeCommand.execute(missing);
  assert.match(missing.sent.replies[0].content, /Không thấy theme riêng/);

  const out = themeInteraction({ guildId, sub: "xuat", strings: { ten: "Studio Của Tôi" } });
  await themeCommand.execute(out);
  const file = out.sent.replies[0].files[0];
  assert.match(file.name, /^thau-theme-Studio-Cua-Toi\.json$/);
  assert.deepEqual(parseThemeFile(file.attachment.toString()).theme, theme);

  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => file.attachment });
    const other = newGuildId();
    grant(other, "pro", 30);
    const imp = themeInteraction({ guildId: other, sub: "nhap", strings: { ten: "Từ bạn" }, attachment: { size: 100, name: "t.json", url: "https://cdn.discordapp.com/a/b/t.json" } });
    await themeCommand.execute(imp);
    assert.match(imp.sent.edits[0].content, /Đã nhập theme riêng \*\*Từ bạn\*\*/);
    assert.deepEqual(getCustomTheme(other, "Từ bạn").theme, theme);

    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('{"kind":"nope"}') });
    const bad = themeInteraction({ guildId: other, sub: "nhap", strings: { ten: "Xấu" }, attachment: { size: 10, name: "t.json", url: "https://cdn.discordapp.com/a/b/t.json" } });
    await themeCommand.execute(bad);
    assert.match(bad.sent.edits[0].content, /không phải theme hợp lệ/);
    assert.equal(countCustomThemes(other), 1);
  } finally {
    globalThis.fetch = original;
  }

  const del = themeInteraction({ guildId, sub: "xoa", strings: { ten: "Studio Của Tôi" } });
  await themeCommand.execute(del);
  const ids = customIds(del.sent.replies[0]);
  assert.ok(ids.some((i) => i.startsWith("theme:del:admin1:Studio Của Tôi")));
  const press = themeInteraction({ guildId });
  await themeCommand.handleComponent(press, ids.find((i) => i.includes(":del:")).split(":").slice(1));
  assert.match(press.sent.updates[0].content, /Đã xoá/);
  assert.equal(countCustomThemes(guildId), 0);

  const wrongUser = themeInteraction({ guildId, userId: "other" });
  await themeCommand.handleComponent(wrongUser, ["del", "admin1", "x"]);
  assert.equal(wrongUser.sent.replies.length, 1);
  const cancel = themeInteraction({ guildId });
  await themeCommand.handleComponent(cancel, ["no", "admin1"]);
  assert.match(cancel.sent.updates[0].content, /huỷ/);
});

test("a server whose plan has no saved themes cannot use or import them, and non-admins are turned away", async () => {
  const guildId = newGuildId();
  // A theme saved while the server was on Pro stays in the database after the plan ends
  saveCustomTheme(guildId, "Cũ", extractCustomTheme(buildPlan("anime")));
  const use = themeInteraction({ guildId, sub: "dung", strings: { ten: "Cũ" } });
  await themeCommand.execute(use);
  assert.match(use.sent.replies[0].content, /Pro/);

  const imp = themeInteraction({ guildId, sub: "nhap", strings: { ten: "Mới" }, attachment: { size: 10, name: "t.json", url: "https://cdn.discordapp.com/a/b/t.json" } });
  await themeCommand.execute(imp);
  assert.match(imp.sent.replies[0].content, /Pro/);

  const plain = themeInteraction({ guildId, sub: "danhsach", admin: false });
  await themeCommand.execute(plain);
  assert.equal(plain.sent.replies.length, 1);
  assert.equal(plain.sent.replies[0].embeds, undefined);
});

test("the channel types the saved-theme tests rely on match discord.js", () => {
  assert.equal(ChannelType.GuildText, 0);
  assert.equal(ChannelType.GuildVoice, 2);
});

test("a saved theme can be composed at another humor level, changing only the shared rules", async () => {
  const { buildPlan } = await import("../src/themes/index.js");
  const { composeCustom, extractCustomTheme } = await import("../src/themes/custom.js");
  const saved = extractCustomTheme(buildPlan(["gaming", "anime"]));
  const troll = composeCustom(saved);
  const gentle = composeCustom(saved, { humor: "nhe" });
  assert.equal(gentle.humor, "nhe");
  assert.deepEqual(gentle.categories, troll.categories);
  assert.notDeepEqual(gentle.rules.slice(0, 8), troll.rules.slice(0, 8));
});
