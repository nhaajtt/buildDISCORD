import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "rolemenus-test-"));

const rm = await import("../src/activity/rolemenus.js");
const command = (await import("../src/commands/vaitro.js")).default;
const { grant } = await import("../src/license.js");

const { checkPicks, decideToggle, parseRoles, createMenu, getMenu, listMenus, countMenus, buildPanel } = rm;

let counter = 0;
const gid = () => `9200000000000${String(++counter).padStart(4, "0")}`;
let nextId = 920100000000000000n;
const newId = () => String(nextId++);
const BOT = "920000000000000099";
const ADMIN = "920000000000000001";
const USER = "920000000000000002";

function makeRole(guildId, { name = "Role", position = 1, permissions = 0n, managed = false } = {}) {
  return { id: newId(), name, position, permissions: { bitfield: permissions }, managed, guild: { id: guildId }, editable: true };
}

function fakeGuild({ manage = true, botTop = 10 } = {}) {
  const id = gid();
  const roles = new Map();
  const sent = [];
  const channel = {
    id: newId(),
    type: 0,
    sent,
    messages: { fetch: async (messageId) => channel.stored.get(messageId) ?? Promise.reject(new Error("unknown message")) },
    stored: new Map(),
    send: async (payload) => {
      const message = { id: newId(), author: { id: BOT }, payload, edits: [], edit: async (p) => message.edits.push(p) };
      channel.stored.set(message.id, message);
      sent.push(message);
      return message;
    },
  };
  const guild = {
    id,
    roles: { cache: roles },
    channels: { cache: new Map([[channel.id, channel]]) },
    members: { me: { id: BOT, permissions: { has: (f) => manage && f === "ManageRoles" }, roles: { highest: { position: botTop } } } },
    channel,
  };
  return guild;
}

const addRole = (guild, opts) => {
  const role = makeRole(guild.id, opts);
  guild.roles.cache.set(role.id, role);
  return role;
};

function fakeMember(guild, held = []) {
  const cache = new Map(held.map((r) => [r.id, r]));
  const log = [];
  return {
    roles: {
      cache,
      add: async (id) => {
        log.push(["add", id]);
        cache.set(id, guild.roles.cache.get(id));
      },
      remove: async (id) => {
        log.push(["remove", id]);
        cache.delete(id);
      },
    },
    log,
    permissions: { has: () => false },
  };
}

function command_(guild, { sub, options = {}, admin = true } = {}) {
  const replies = [];
  return {
    replies,
    guildId: guild.id,
    guild,
    channel: guild.channel,
    client: { user: { id: BOT } },
    user: { id: ADMIN },
    member: { permissions: { has: (f) => admin && f === P.Administrator } },
    options: {
      getSubcommand: () => sub,
      getInteger: (n) => options[n] ?? null,
      getString: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
    },
    reply: async (p) => replies.push(p),
  };
}

function press(guild, member, { menuId, roleId, kind = "t", values } = {}) {
  const replies = [];
  return {
    replies,
    guildId: guild.id,
    guild,
    member,
    user: { id: USER },
    values,
    reply: async (p) => replies.push(p),
    run: () => command.handleComponent({ guildId: guild.id, guild, member, user: { id: USER }, values, reply: async (p) => replies.push(p) }, kind === "s" ? ["s", String(menuId)] : ["t", String(menuId), roleId]),
  };
}

const proGuild = (opts) => {
  const guild = fakeGuild(opts);
  grant(guild.id, "pro", 30);
  return guild;
};

// ---------- pure ----------

test("checkPicks accepts ordinary roles and explains every refusal", () => {
  const g = "930000000000000001";
  const ok = makeRole(g, { position: 3 });
  assert.equal(checkPicks([{ role: ok, emoji: "" }], 10), null);

  assert.match(checkPicks([{ role: makeRole(g, { position: 11 }), emoji: "" }], 10), /cao hơn/);
  assert.match(checkPicks([{ role: makeRole(g, { position: 10 }), emoji: "" }], 10), /cao hơn/);
  assert.match(checkPicks([{ role: makeRole(g, { managed: true }), emoji: "" }], 10), /quản lý/);
  assert.match(checkPicks([{ role: { ...makeRole(g), id: g, name: "@everyone" }, emoji: "" }], 10), /mọi người/);
  assert.match(checkPicks([{ role: null, emoji: "" }], 10), /không còn tồn tại/);
  for (const bit of ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "BanMembers", "KickMembers", "ModerateMembers", "MentionEveryone", "ManageMessages", "ManageWebhooks"]) {
    const reason = checkPicks([{ role: makeRole(g, { permissions: P[bit] }), emoji: "" }], 10);
    assert.match(reason, /quyền nguy hiểm/, bit);
  }
  assert.match(checkPicks([{ role: ok, emoji: "" }, { role: ok, emoji: "" }], 10), /hai lần/);
  assert.match(checkPicks([{ role: ok, emoji: "<script>" }], 10), /Emoji số 1/);
  assert.equal(checkPicks([{ role: ok, emoji: "🎮" }], 10), null);
  // the bot position being unknown means nothing can be proven safe
  assert.match(checkPicks([{ role: ok, emoji: "" }], undefined), /cao hơn/);
});

test("decideToggle: multi toggles one role, single swaps within the menu only", () => {
  const menuRoleIds = ["a", "b", "c"];
  assert.deepEqual(decideToggle({ mode: "multi", menuRoleIds, held: new Set(["b"]), roleId: "a" }), { add: ["a"], remove: [], kind: "gave" });
  assert.deepEqual(decideToggle({ mode: "multi", menuRoleIds, held: new Set(["a"]), roleId: "a" }), { add: [], remove: ["a"], kind: "took" });
  assert.deepEqual(decideToggle({ mode: "single", menuRoleIds, held: new Set(["b", "outside"]), roleId: "a" }), { add: ["a"], remove: ["b"], kind: "swapped" });
  assert.deepEqual(decideToggle({ mode: "single", menuRoleIds, held: new Set(["a", "b"]), roleId: "a" }), { add: [], remove: ["a"], kind: "took" });
  assert.deepEqual(decideToggle({ mode: "single", menuRoleIds, held: new Set(["outside"]), roleId: "a" }), { add: ["a"], remove: [], kind: "gave" });
});

test("stored roles are rebuilt defensively", () => {
  assert.deepEqual(parseRoles("not json"), []);
  assert.deepEqual(parseRoles(null), []);
  assert.deepEqual(parseRoles('{"id":"1"}'), []);
  const raw = [{ id: "920100000000000001", emoji: "x".repeat(50) }, { id: "920100000000000001" }, { id: "nope" }, { id: 5 }, null, ...Array.from({ length: 30 }, (_, i) => ({ id: `92020000000000${String(i).padStart(4, "0")}` }))];
  const roles = parseRoles(raw);
  assert.equal(roles.length, 10);
  assert.equal(roles[0].emoji.length, 8);
  assert.equal(new Set(roles.map((r) => r.id)).size, 10);
});

// ---------- command ----------

test("the command is admin-only by default and fits Discord's limits", () => {
  const json = command.data.toJSON();
  assert.equal(json.default_member_permissions, String(P.Administrator));
  const tao = json.options.find((o) => o.name === "tao");
  assert.ok(tao.options.length <= 25);
  assert.equal(tao.options.filter((o) => o.name.startsWith("role")).length, 10);
  assert.equal(tao.options.filter((o) => o.name.startsWith("emoji")).length, 10);
  // required options come first
  const flags = tao.options.map((o) => Boolean(o.required));
  assert.deepEqual(flags, [...flags].sort((a, b) => Number(b) - Number(a)));
});

test("a non-admin cannot create, post, list or delete menus", async () => {
  const guild = proGuild();
  const role = addRole(guild);
  for (const sub of ["tao", "dang", "danhsach", "xoa"]) {
    const i = command_(guild, { sub, admin: false, options: { tieude: "x", chedo: "multi", role1: role, menu: 1 } });
    await command.execute(i);
    assert.equal(i.replies.length, 1);
    assert.equal(i.replies[0].embeds, undefined);
  }
  assert.equal(countMenus(guild.id), 0);
  assert.equal(guild.channel.sent.length, 0);
});

test("tao creates and posts a menu with buttons for up to five roles", async () => {
  const guild = proGuild();
  const roles = [addRole(guild, { name: "Game thủ" }), addRole(guild, { name: "Họa sĩ" })];
  const i = command_(guild, { sub: "tao", options: { tieude: "  Chọn sở thích\n  ", chedo: "single", role1: roles[0], role2: roles[1], emoji1: "🎮" } });
  await command.execute(i);
  assert.match(i.replies[0].content, /Menu #1/);
  const [menu] = listMenus(guild.id);
  assert.equal(menu.title, "Chọn sở thích");
  assert.equal(menu.mode, "single");
  assert.equal(menu.message_id, guild.channel.sent[0].id);
  const panel = guild.channel.sent[0].payload;
  assert.equal(panel.components[0].components.length, 2);
  assert.equal(panel.components[0].components[0].data.custom_id, `vaitro:t:${menu.id}:${roles[0].id}`);
  assert.ok(panel.components[0].components[0].data.custom_id.startsWith("vaitro:"));
  assert.deepEqual(panel.allowedMentions, { parse: [] });
});

test("above five roles the panel becomes a select menu", () => {
  const guild = proGuild();
  const roles = Array.from({ length: 8 }, (_, i) => addRole(guild, { name: `R${i}` }));
  const id = createMenu(guild.id, guild.channel.id, "Many", "multi", roles.map((r) => ({ id: r.id, emoji: "" })));
  const panel = buildPanel(getMenu(id), guild);
  assert.equal(panel.components.length, 1);
  const select = panel.components[0].components[0].toJSON();
  assert.equal(select.custom_id, `vaitro:s:${id}`);
  assert.equal(select.options.length, 8);
  assert.equal(select.max_values, 1);
});

test("a dangerous, high, managed or duplicate role is refused and nothing is created", async () => {
  const guild = proGuild();
  const good = addRole(guild);
  const cases = [
    addRole(guild, { permissions: P.ManageMessages }),
    addRole(guild, { position: 50 }),
    addRole(guild, { managed: true }),
  ];
  for (const bad of cases) {
    const i = command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: good, role2: bad } });
    await command.execute(i);
    assert.equal(i.replies[0].embeds, undefined);
    assert.match(i.replies[0].content, /Role/);
  }
  const dup = command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: good, role2: good } });
  await command.execute(dup);
  assert.match(dup.replies[0].content, /hai lần/);
  const emoji = command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: good, emoji1: "<a:evil:1>" } });
  await command.execute(emoji);
  assert.match(emoji.replies[0].content, /Emoji/);
  assert.equal(countMenus(guild.id), 0);
  assert.equal(guild.channel.sent.length, 0);
});

test("a bot without Manage Roles says so instead of creating a useless menu", async () => {
  const guild = proGuild({ manage: false });
  const role = addRole(guild);
  const i = command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: role } });
  await command.execute(i);
  assert.match(i.replies[0].content, /Quản lý role/);
  assert.equal(countMenus(guild.id), 0);
});

test("an empty or hostile title is refused", async () => {
  const guild = proGuild();
  const role = addRole(guild);
  for (const title of ["", "   ", "‮​", "\n\n"]) {
    const i = command_(guild, { sub: "tao", options: { tieude: title, chedo: "multi", role1: role } });
    await command.execute(i);
    assert.match(i.replies[0].content, /Tiêu đề/);
  }
  assert.equal(countMenus(guild.id), 0);
});

test("the plan limits how many menus a server can have", async () => {
  const guild = fakeGuild();
  const role = addRole(guild);
  for (let n = 1; n <= 3; n += 1) {
    const i = command_(guild, { sub: "tao", options: { tieude: `M${n}`, chedo: "multi", role1: role } });
    await command.execute(i);
    assert.match(i.replies[0].content, new RegExp(`Menu #`));
  }
  const over = command_(guild, { sub: "tao", options: { tieude: "M4", chedo: "multi", role1: role } });
  await command.execute(over);
  assert.match(over.replies[0].content, /3 menu vai trò/);
  assert.equal(countMenus(guild.id), 3);
  // the limit is per server
  const other = fakeGuild();
  const otherRole = addRole(other);
  const fine = command_(other, { sub: "tao", options: { tieude: "A", chedo: "multi", role1: otherRole } });
  await command.execute(fine);
  assert.match(fine.replies[0].content, /Menu #/);
  // a Pro server gets ten
  const pro = proGuild();
  const proRole = addRole(pro);
  for (let n = 1; n <= 10; n += 1) await command.execute(command_(pro, { sub: "tao", options: { tieude: `P${n}`, chedo: "multi", role1: proRole } }));
  assert.equal(countMenus(pro.id), 10);
  const eleventh = command_(pro, { sub: "tao", options: { tieude: "P11", chedo: "multi", role1: proRole } });
  await command.execute(eleventh);
  assert.match(eleventh.replies[0].content, /10 menu vai trò/);
});

test("when the channel refuses, the menu is saved and the admin is told how to post it", async () => {
  const guild = proGuild();
  guild.channel.send = async () => {
    throw new Error("Missing Permissions");
  };
  const role = addRole(guild);
  const i = command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: role } });
  await command.execute(i);
  assert.match(i.replies[0].content, /chưa đăng được/);
  assert.equal(countMenus(guild.id), 1);
});

test("dang refreshes in place instead of posting twice, and list and delete work", async () => {
  const guild = proGuild();
  const role = addRole(guild, { name: "Cũ" });
  await command.execute(command_(guild, { sub: "tao", options: { tieude: "T", chedo: "multi", role1: role } }));
  const [menu] = listMenus(guild.id);
  role.name = "Mới";
  const again = command_(guild, { sub: "dang", options: { menu: menu.id } });
  await command.execute(again);
  assert.match(again.replies[0].content, /Đã đăng/);
  assert.equal(guild.channel.sent.length, 1);
  assert.equal(guild.channel.sent[0].edits.length, 1);
  assert.equal(guild.channel.sent[0].edits[0].components[0].components[0].data.label, "Mới");

  const list = command_(guild, { sub: "danhsach" });
  await command.execute(list);
  assert.match(list.replies[0].embeds[0].data.description, /#1/);

  const missing = command_(guild, { sub: "dang", options: { menu: 999 } });
  await command.execute(missing);
  assert.match(missing.replies[0].content, /Không thấy/);

  // another server's menu number is not reachable
  const other = proGuild();
  const steal = command_(other, { sub: "xoa", options: { menu: menu.id } });
  await command.execute(steal);
  assert.match(steal.replies[0].content, /Không thấy/);
  assert.equal(countMenus(guild.id), 1);

  const del = command_(guild, { sub: "xoa", options: { menu: menu.id } });
  await command.execute(del);
  assert.equal(countMenus(guild.id), 0);
  assert.deepEqual(guild.channel.sent[0].edits.at(-1), { components: [] });
});

// ---------- pressing ----------

function menuWith(guild, count, mode) {
  const roles = Array.from({ length: count }, (_, i) => addRole(guild, { name: `R${i}` }));
  const id = createMenu(guild.id, guild.channel.id, "Menu", mode, roles.map((r) => ({ id: r.id, emoji: "" })));
  return { id, roles };
}

test("pressing toggles a role on and off, privately", async () => {
  const guild = proGuild();
  const { id, roles } = menuWith(guild, 3, "multi");
  const member = fakeMember(guild);
  const first = press(guild, member, { menuId: id, roleId: roles[0].id });
  await first.run();
  assert.deepEqual(member.log, [["add", roles[0].id]]);
  assert.match(first.replies[0].content, /Đã cấp/);
  assert.ok(first.replies[0].flags);
  const second = press(guild, member, { menuId: id, roleId: roles[0].id });
  await second.run();
  assert.deepEqual(member.log.at(-1), ["remove", roles[0].id]);
  assert.match(second.replies[0].content, /Đã bỏ/);
  // pressing twice is a clean toggle, never a double grant
  const third = press(guild, member, { menuId: id, roleId: roles[1].id });
  await third.run();
  await press(guild, member, { menuId: id, roleId: roles[2].id }).run();
  assert.deepEqual([...member.roles.cache.keys()].sort(), [roles[1].id, roles[2].id].sort());
});

test("single mode swaps within the menu and leaves other roles alone", async () => {
  const guild = proGuild();
  const { id, roles } = menuWith(guild, 3, "single");
  const outside = addRole(guild, { name: "Ngoài" });
  const member = fakeMember(guild, [roles[0], outside]);
  const p = press(guild, member, { menuId: id, roleId: roles[1].id });
  await p.run();
  assert.deepEqual([...member.roles.cache.keys()].sort(), [roles[1].id, outside.id].sort());
  assert.match(p.replies[0].content, /Đã đổi/);
});

test("the select menu path toggles the chosen role", async () => {
  const guild = proGuild();
  const { id, roles } = menuWith(guild, 7, "multi");
  const member = fakeMember(guild);
  await press(guild, member, { menuId: id, kind: "s", values: [roles[6].id] }).run();
  assert.ok(member.roles.cache.has(roles[6].id));
  const forged = press(guild, member, { menuId: id, kind: "s", values: [] });
  await forged.run();
  assert.match(forged.replies[0].content, /không còn trong menu/);
});

test("a forged button for a role outside the menu grants nothing", async () => {
  const guild = proGuild();
  const { id } = menuWith(guild, 2, "multi");
  const outsider = addRole(guild, { name: "Ngoài menu" });
  const member = fakeMember(guild);
  const p = press(guild, member, { menuId: id, roleId: outsider.id });
  await p.run();
  assert.deepEqual(member.log, []);
  assert.match(p.replies[0].content, /không còn trong menu/);
});

test("a role removed from the menu, deleted, or made dangerous since is not handed out", async () => {
  const guild = proGuild();
  const { id, roles } = menuWith(guild, 3, "multi");
  const member = fakeMember(guild);

  roles[0].permissions = { bitfield: P.Administrator };
  const dangerous = press(guild, member, { menuId: id, roleId: roles[0].id });
  await dangerous.run();
  assert.match(dangerous.replies[0].content, /không còn an toàn/);

  roles[1].position = 99;
  const high = press(guild, member, { menuId: id, roleId: roles[1].id });
  await high.run();
  assert.match(high.replies[0].content, /không còn an toàn/);

  guild.roles.cache.delete(roles[2].id);
  const gone = press(guild, member, { menuId: id, roleId: roles[2].id });
  await gone.run();
  assert.match(gone.replies[0].content, /bị xoá/);
  assert.deepEqual(member.log, []);

  // dropping a role someone already holds stays possible
  member.roles.cache.set(roles[0].id, roles[0]);
  await press(guild, member, { menuId: id, roleId: roles[0].id }).run();
  assert.deepEqual(member.log, [["remove", roles[0].id]]);
});

test("a menu from another server, an unknown menu or a junk id does nothing", async () => {
  const guild = proGuild();
  const other = proGuild();
  const { id, roles } = menuWith(other, 2, "multi");
  const member = fakeMember(guild);
  for (const menuId of [id, 9999, "abc", "-1", "1e9", ""]) {
    const p = press(guild, member, { menuId, roleId: roles[0].id });
    await p.run();
    assert.match(p.replies[0].content, /không còn nữa/);
  }
  assert.deepEqual(member.log, []);
});

test("without Manage Roles a press says what is missing, and a Discord failure is reported", async () => {
  const noPerm = proGuild({ manage: false });
  const a = menuWith(noPerm, 1, "multi");
  const p = press(noPerm, fakeMember(noPerm), { menuId: a.id, roleId: a.roles[0].id });
  await p.run();
  assert.match(p.replies[0].content, /Quản lý role/);

  const guild = proGuild();
  const { id, roles } = menuWith(guild, 1, "multi");
  const member = fakeMember(guild);
  member.roles.add = async () => {
    throw new Error("Missing Access");
  };
  const failing = press(guild, member, { menuId: id, roleId: roles[0].id });
  await failing.run();
  assert.match(failing.replies[0].content, /không cho thầu đổi role/);
});

test("components outside the menu actions are ignored", async () => {
  const guild = proGuild();
  const replies = [];
  await command.handleComponent({ guildId: guild.id, guild, reply: async (p) => replies.push(p) }, ["x", "1", "2"]);
  await command.handleComponent({ guildId: null, reply: async (p) => replies.push(p) }, ["t", "1", "2"]);
  assert.equal(replies.length, 0);
});
