import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from "discord.js";
import { getDb } from "../db.js";
import { roleProblem } from "../onboarding/safety.js";
import { validEmoji } from "../tickets/logic.js";
import { SNOWFLAKE } from "../settings.js";
import { cleanText } from "./text.js";
import { lines, roleReason } from "../humor/rolemenus.js";

export const MAX_MENU_ROLES = 10;
export const MODES = ["single", "multi"];

// ---------- pure logic ----------

// Roles as stored: a JSON list of { id, emoji }, rebuilt field by field so a damaged row cannot leak anything odd
export function parseRoles(raw) {
  let list;
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const id = typeof item?.id === "string" && SNOWFLAKE.test(item.id) ? item.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, emoji: cleanText(item?.emoji, 8) });
    if (out.length >= MAX_MENU_ROLES) break;
  }
  return out;
}

// The first problem among the picked roles as a sentence, or null when all of them may go in a menu.
// picks: [{ role, emoji }], botTop: position of the bot's highest role
export function checkPicks(picks, botTop) {
  const ids = new Set();
  for (const [i, pick] of picks.entries()) {
    const problem = roleProblem(pick.role, botTop);
    if (problem) return roleReason(pick.role?.name, problem);
    if (ids.has(pick.role.id)) return lines.duplicate;
    ids.add(pick.role.id);
    if (pick.emoji && !validEmoji(pick.emoji)) return lines.badEmoji(i + 1);
  }
  return null;
}

// What pressing a role does. In single mode taking a role also drops every other role of the same menu the person holds.
export function decideToggle({ mode, menuRoleIds, held, roleId }) {
  if (held.has(roleId)) return { add: [], remove: [roleId], kind: "took" };
  const remove = mode === "single" ? menuRoleIds.filter((id) => id !== roleId && held.has(id)) : [];
  return { add: [roleId], remove, kind: remove.length ? "swapped" : "gave" };
}

// ---------- storage ----------

const mapRow = (row) => (row ? { ...row, roles: parseRoles(row.roles) } : null);

export function createMenu(guildId, channelId, title, mode, roles, now = Date.now()) {
  const result = getDb()
    .prepare("INSERT INTO role_menus (guild_id, channel_id, message_id, title, mode, roles, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)")
    .run(guildId, channelId, cleanText(title, 100), MODES.includes(mode) ? mode : "multi", JSON.stringify(parseRoles(roles)), now);
  return Number(result.lastInsertRowid);
}

export const getMenu = (id) => (Number.isSafeInteger(id) && id > 0 ? mapRow(getDb().prepare("SELECT * FROM role_menus WHERE id = ?").get(id)) : null);

export const listMenus = (guildId) => getDb().prepare("SELECT * FROM role_menus WHERE guild_id = ? ORDER BY id").all(guildId).map(mapRow);

export const countMenus = (guildId) => Number(getDb().prepare("SELECT COUNT(*) AS n FROM role_menus WHERE guild_id = ?").get(guildId).n);

export function setMenuMessage(id, channelId, messageId) {
  getDb().prepare("UPDATE role_menus SET channel_id = ?, message_id = ? WHERE id = ?").run(channelId, messageId, id);
}

export const deleteMenu = (guildId, id) => Number(getDb().prepare("DELETE FROM role_menus WHERE id = ? AND guild_id = ?").run(id, guildId).changes) > 0;

// ---------- the panel ----------

// Buttons up to five roles, a select menu above that. Role names come from the live server, so a renamed role shows its new name.
export function buildPanel(menu, guild) {
  const entries = menu.roles
    .map((r) => ({ ...r, role: guild.roles?.cache?.get(r.id) }))
    .filter((r) => r.role);
  const description = entries.length
    ? entries.map((r) => `${r.emoji ? `${r.emoji} ` : ""}<@&${r.id}>`).join("\n")
    : lines.stale;
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(menu.title.slice(0, 250))
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: menu.mode === "single" ? lines.panelFooterSingle : lines.panelFooter });

  const components = [];
  if (entries.length && entries.length <= 5) {
    const row = new ActionRowBuilder();
    for (const r of entries) {
      const button = new ButtonBuilder().setCustomId(`vaitro:t:${menu.id}:${r.id}`).setLabel(r.role.name.slice(0, 80)).setStyle(ButtonStyle.Secondary);
      if (r.emoji && validEmoji(r.emoji)) button.setEmoji(r.emoji);
      row.addComponents(button);
    }
    components.push(row);
  } else if (entries.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`vaitro:s:${menu.id}`)
      .setPlaceholder(lines.selectPlaceholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        entries.map((r) => {
          const option = { label: r.role.name.slice(0, 100), value: r.id };
          if (r.emoji && validEmoji(r.emoji)) option.emoji = r.emoji;
          return option;
        }),
      );
    components.push(new ActionRowBuilder().addComponents(select));
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

// Posts the panel, or refreshes it in place when it already lives in that channel. Returns { ok, channel } or { ok: false }.
export async function postPanel(guild, menu, channel, botId) {
  try {
    const payload = buildPanel(menu, guild);
    if (menu.message_id && menu.channel_id === channel.id) {
      const existing = await channel.messages.fetch(menu.message_id).catch(() => null);
      if (existing && existing.author?.id === botId) {
        await existing.edit(payload);
        return { ok: true, channel };
      }
    }
    const sent = await channel.send(payload);
    // A panel left behind in another channel stops working, so nobody presses a button that no longer matches
    if (menu.message_id && menu.channel_id !== channel.id) await retirePanel(guild, menu, botId);
    setMenuMessage(menu.id, channel.id, sent.id);
    return { ok: true, channel };
  } catch {
    return { ok: false };
  }
}

// Strips the buttons from the menu's old message, only when the bot wrote it
export async function retirePanel(guild, menu, botId) {
  try {
    if (!menu.message_id) return;
    const channel = guild.channels?.cache?.get(menu.channel_id);
    const message = await channel?.messages?.fetch(menu.message_id);
    if (message && message.author?.id === botId) await message.edit({ components: [] });
  } catch {
    // the message may already be gone, which is the goal anyway
  }
}

// ---------- pressing ----------

// Every press is checked again from scratch: the menu, the role being in it, the role still being safe, the bot's permission.
export async function handlePress(interaction, [action, menuIdText, roleIdText]) {
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  const { guild, guildId } = interaction;
  if (!guild || !guildId) return;

  const menu = getMenu(Number(menuIdText));
  if (!menu || menu.guild_id !== guildId) return reply(lines.stale);
  const roleId = action === "s" ? interaction.values?.[0] : roleIdText;
  if (!menu.roles.some((r) => r.id === roleId)) return reply(lines.roleNotInMenu);

  const role = guild.roles?.cache?.get(roleId);
  if (!role) return reply(lines.roleGone);
  const me = guild.members?.me;
  if (!me?.permissions?.has?.("ManageRoles")) return reply(lines.noPerm);
  const botTop = me.roles?.highest?.position;

  const member = interaction.member;
  if (!member?.roles?.cache) return reply(lines.failed);
  const held = new Set(member.roles.cache.keys());
  // Giving a role needs it to be safe right now; dropping one the person already holds is always harmless
  if (!held.has(roleId) && roleProblem(role, botTop)) return reply(lines.roleUnsafe);
  const plan = decideToggle({ mode: menu.mode, menuRoleIds: menu.roles.map((r) => r.id), held, roleId });

  try {
    for (const id of plan.remove) {
      // Others are only dropped when they are still ordinary roles below the bot
      const other = guild.roles.cache.get(id);
      if (id === roleId || (other && !roleProblem(other, botTop))) await member.roles.remove(id);
    }
    for (const id of plan.add) await member.roles.add(id);
  } catch {
    return reply(lines.failed);
  }
  return reply(lines[plan.kind](role.name.slice(0, 60)));
}
