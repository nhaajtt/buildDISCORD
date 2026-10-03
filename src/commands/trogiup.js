import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PLANS, getPlan } from "../license.js";
import { HANDBOOK_URL, helpItems, helpLines } from "../humor/wizard.js";

const GROUPS = ["build", "protect", "engage", "business", "other"];
const has = (plan, flag) => Boolean(plan?.[flag]);

// The cheapest plan that has a flag, for the lock hint
export function cheapestPlanFor(flag) {
  return Object.values(PLANS).find((p) => has(p, flag))?.label ?? "Pro";
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

function line(item, plan) {
  const base = `\`/${item.name}\` ${item.text}`;
  if (!item.flag || has(plan, item.flag)) return base;
  const hint = helpLines.lockedHint(cheapestPlanFor(item.flag));
  // A partial item works on every plan, only its stronger form is locked
  if (item.partial) return `${base} (${item.lockedNote ?? "mức cao"}: ${hint})`;
  return `${helpLines.lockedPrefix} \`/${item.name}\` ${item.text} (${hint})`;
}

// Commands the table above does not know (added later) still show up, under "other". Owner-only commands stay hidden.
function strangers(commands) {
  const known = new Set(helpItems.map((i) => i.name));
  const out = [];
  for (const command of commands?.values?.() ?? []) {
    const json = command?.data?.toJSON?.() ?? {};
    if (!json.name || known.has(json.name) || json.name === "trogiup") continue;
    if (json.default_member_permissions === "0") continue;
    out.push({ group: "other", name: json.name, text: String(json.description ?? "").slice(0, 80) });
  }
  return out;
}

// Pure: the plan and the command list in, one embed out
export function helpEmbed(plan, commands = null) {
  const items = [...helpItems, ...strangers(commands)];
  const embed = new EmbedBuilder().setColor(0xf5c518).setTitle(helpLines.title).addFields({ name: helpLines.howTitle, value: helpLines.how.join("\n") });
  for (const group of GROUPS) {
    const rows = items.filter((i) => i.group === group).map((i) => line(i, plan));
    if (rows.length) embed.addFields({ name: helpLines.groupTitles[group], value: clip(rows.join("\n"), 1000) });
  }
  return embed.setFooter({ text: `Gói hiện tại: ${plan?.label ?? PLANS.free.label}. ${helpLines.footer}` });
}

export default {
  data: new SlashCommandBuilder().setName("trogiup").setDescription("Xem thầu làm được gì, chia theo nhóm, và cách bắt đầu nhanh").setDMPermission(false),

  async execute(interaction) {
    const plan = getPlan(interaction.guildId);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(helpLines.handbookButton).setStyle(ButtonStyle.Link).setURL(HANDBOOK_URL));
    await interaction.reply({ embeds: [helpEmbed(plan, interaction.client?.commands)], components: [row], flags: MessageFlags.Ephemeral });
  },
};
