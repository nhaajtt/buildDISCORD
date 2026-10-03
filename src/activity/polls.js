import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getDb } from "../db.js";
import { cleanText } from "./text.js";
import { pollLines as lines } from "../humor/giveaways.js";

export const MAX_ACTIVE_POLLS = 10;
export const MAX_OPTIONS = 5;

// ---------- pure logic ----------

// Cleans the typed options: trimmed, capped, empty ones dropped, repeats merged (ignoring case). Null when fewer than two remain.
export function cleanOptions(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const text = cleanText(item, 80);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out.length >= 2 ? out : null;
}

export function percentBar(fraction, width = 10) {
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  const filled = Math.round(f * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

// One text block per option: the bar, the percentage and the count
export function renderResults(options, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  return options
    .map((text, i) => {
      const n = counts[i] ?? 0;
      const f = total ? n / total : 0;
      return `**${i + 1}. ${text}**\n${percentBar(f)} ${Math.round(f * 100)}% (${n})`;
    })
    .join("\n\n");
}

// ---------- storage ----------

function mapRow(row) {
  if (!row) return null;
  let options = [];
  try {
    const parsed = JSON.parse(row.options);
    options = Array.isArray(parsed) ? parsed.filter((o) => typeof o === "string").slice(0, MAX_OPTIONS) : [];
  } catch {
    options = [];
  }
  return { ...row, options };
}

export function createPoll({ guildId, channelId, question, options, endsAt = null, createdBy, now = Date.now() }) {
  const result = getDb()
    .prepare("INSERT INTO polls (guild_id, channel_id, message_id, question, options, ends_at, status, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, 'active', ?, ?)")
    .run(guildId, channelId, question, JSON.stringify(options), endsAt, createdBy, now);
  return Number(result.lastInsertRowid);
}

export const getPoll = (id) => (Number.isSafeInteger(id) && id > 0 ? mapRow(getDb().prepare("SELECT * FROM polls WHERE id = ?").get(id)) : null);

export const setPollMessage = (id, messageId) => getDb().prepare("UPDATE polls SET message_id = ? WHERE id = ?").run(messageId, id);

export function discardPoll(id) {
  const db = getDb();
  db.prepare("DELETE FROM poll_votes WHERE poll_id = ?").run(id);
  db.prepare("DELETE FROM polls WHERE id = ? AND message_id IS NULL").run(id);
}

export const countActivePolls = (guildId) => Number(getDb().prepare("SELECT COUNT(*) AS n FROM polls WHERE guild_id = ? AND status = 'active'").get(guildId).n);

export const duePolls = (now, limit = 500) =>
  getDb().prepare("SELECT * FROM polls WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ? ORDER BY ends_at LIMIT ?").all(now, limit).map(mapRow);

// Closes a poll. Only the call that flips active to closed returns true, so results are posted once.
export const closePoll = (id) => Number(getDb().prepare("UPDATE polls SET status = 'closed' WHERE id = ? AND status = 'active'").run(id).changes) === 1;

export function tally(id, optionCount) {
  const counts = Array(optionCount).fill(0);
  for (const row of getDb().prepare("SELECT option_index AS i, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_index").all(id)) {
    if (row.i >= 0 && row.i < optionCount) counts[row.i] = Number(row.n);
  }
  return counts;
}

// One vote per person; a different option replaces the earlier vote. Returns "new", "changed" or "same".
export function castVote(id, userId, index) {
  const db = getDb();
  const before = db.prepare("SELECT option_index AS i FROM poll_votes WHERE poll_id = ? AND user_id = ?").get(id, userId);
  if (before && before.i === index) return "same";
  db.prepare("INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index").run(id, userId, index);
  return before ? "changed" : "new";
}

// ---------- the message ----------

export function buildPollPayload(poll, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const closed = poll.status !== "active";
  const header = closed ? "" : `${poll.ends_at ? lines.endsLine(Math.floor(poll.ends_at / 1000)) : lines.noEnd}\n\n`;
  const embed = new EmbedBuilder()
    .setColor(closed ? 0x95a5a6 : 0x3498db)
    .setTitle(closed ? lines.closedTitle(poll.question) : lines.title(poll.question))
    .setDescription(`${header}${renderResults(poll.options, counts)}`.slice(0, 4000))
    .setFooter({ text: closed ? lines.footerClosed(total) : lines.footer(total) });
  if (closed) return { embeds: [embed], components: [], allowedMentions: { parse: [] } };

  const choices = new ActionRowBuilder().addComponents(
    poll.options.map((text, i) => new ButtonBuilder().setCustomId(`binhchon:v:${poll.id}:${i}`).setLabel(`${i + 1}. ${text}`.slice(0, 80)).setStyle(ButtonStyle.Primary)),
  );
  const control = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`binhchon:c:${poll.id}`).setLabel(lines.closeButton).setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [choices, control], allowedMentions: { parse: [] } };
}

// ---------- pressing ----------

export async function handlePollPress(interaction, [action, idText, indexText], { now = Date.now() } = {}) {
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (!interaction.guildId) return;
  const poll = getPoll(Number(idText));
  if (!poll || poll.guild_id !== interaction.guildId) return reply(lines.gone);

  if (action === "c") {
    if (poll.status !== "active") return reply(lines.closed);
    const allowed = poll.created_by === interaction.user.id || interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages);
    if (!allowed) return reply(lines.closeNotAllowed);
    if (!closePoll(poll.id)) return reply(lines.closed);
    const closed = { ...poll, status: "closed" };
    return interaction.update(buildPollPayload(closed, tally(poll.id, poll.options.length)));
  }

  if (action !== "v") return;
  if (poll.status !== "active" || (poll.ends_at && now >= poll.ends_at)) return reply(lines.closed);
  if (interaction.user?.bot) return reply(lines.noBots);
  const index = /^\d{1,2}$/.test(String(indexText)) ? Number(indexText) : -1;
  if (index < 0 || index >= poll.options.length) return reply(lines.badChoice);

  const outcome = castVote(poll.id, interaction.user.id, index);
  if (outcome === "same") return reply(lines.same);
  // Updating the message in place shows the new counts to everyone and answers the press at the same time
  return interaction.update(buildPollPayload(poll, tally(poll.id, poll.options.length)));
}
