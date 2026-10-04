import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { track } from "../analytics.js";
import { defang } from "../activity/text.js";
import * as humor from "../humor/lines.js";
import { lines } from "../humor/suggest.js";
import { MAX_BODY, canManage, checkRate, cleanSuggestion } from "../suggest/logic.js";
import { createSuggestion, discardSuggestion, getSuggestion, listOpen, recentTimes, removeSuggestion, setMessage, tally } from "../suggest/store.js";
import { buildSuggestionPayload } from "../suggest/view.js";
import { handleSuggestPress } from "../suggest/handlers.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Permissions the bot needs in the channel to post, by name. Empty when fine or when they cannot be told.
function missingInChannel(channel, me) {
  const perms = channel?.permissionsFor?.(me);
  if (!perms) return [];
  const need = [["ViewChannel", "Xem kênh"], ["SendMessages", "Gửi tin nhắn"], ["EmbedLinks", "Nhúng liên kết"]];
  return need.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}

export default {
  data: new SlashCommandBuilder()
    .setName("gopy")
    .setDescription("Hộp góp ý của server: ai cũng gửi được, bà con vote, quản lý duyệt")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("gui").setDescription("Gửi một góp ý cho server").addStringOption((o) => o.setName("noidung").setDescription("Bạn muốn góp ý gì").setRequired(true).setMaxLength(MAX_BODY)))
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Cài hộp góp ý (quản lý server)")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh nhận góp ý").addChannelTypes(...CHANNEL_TYPES))
        .addRoleOption((o) => o.setName("role").setDescription("Role staff được duyệt góp ý, ngoài người có quyền Quản lý server"))
        .addBooleanOption((o) => o.setName("bat").setDescription("Bật hoặc tắt hộp góp ý")),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các góp ý đang mở (quản lý server)"))
    .addSubcommand((s) =>
      s.setName("xoa").setDescription("Gỡ một góp ý (quản lý server)").addIntegerOption((o) => o.setName("so").setDescription("Số của góp ý").setRequired(true).setMinValue(1).setAutocomplete(true)),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId || !canManage(interaction.member) || interaction.options.getSubcommand() !== "xoa") return interaction.respond([]);
    return interaction.respond(listOpen(interaction.guildId, 25).map((s) => ({ name: `#${s.id} ${defang(s.body)}`.slice(0, 100), value: s.id })));
  },

  async execute(interaction, { now = Date.now() } = {}) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return reply(lines.guildOnly);
    const sub = interaction.options.getSubcommand();

    if (sub !== "gui") {
      // Looked at again on every run, whatever Discord showed or hid
      if (!canManage(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    }

    if (sub === "caidat") {
      const channel = interaction.options.getChannel("kenh");
      const role = interaction.options.getRole("role");
      const enable = interaction.options.getBoolean("bat");
      if (!channel && !role && enable === null) return reply(lines.settingsShow(getSection(guildId, "suggest")));
      if (channel && !CHANNEL_TYPES.includes(channel.type)) return reply(lines.noChannel);
      const current = getSection(guildId, "suggest");
      const nextChannel = channel?.id ?? current.channelId;
      if (enable === true && !nextChannel) return reply(lines.needChannelFirst);
      const saved = patchSection(guildId, "suggest", {
        ...(channel ? { channelId: channel.id } : {}),
        ...(role ? { staffRoleId: role.id !== guildId ? role.id : null } : {}),
        ...(enable !== null ? { enabled: enable } : {}),
      });
      if (saved.enabled) track(guildId, "feature_on");
      const missing = channel ? missingInChannel(channel, guild.members?.me) : [];
      return reply(`${lines.settingsSaved(saved)}${missing.length ? `\n${lines.channelWarn(missing)}` : ""}`);
    }

    if (sub === "danhsach") {
      const rows = listOpen(guildId, 15);
      if (!rows.length) return reply(lines.listEmpty);
      const body = rows
        .map((s) => {
          const votes = tally(s.id);
          return `**#${s.id}** ${defang(s.body).slice(0, 120)}, <@${s.user_id}>, 👍 ${votes.up} 👎 ${votes.down}, <#${s.channel_id}>`;
        })
        .join("\n")
        .slice(0, 4000);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(lines.listTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa") {
      const id = interaction.options.getInteger("so");
      const s = getSuggestion(id);
      if (!s || s.guild_id !== guildId || !removeSuggestion(guildId, id)) return reply(lines.missing);
      try {
        const channel = guild.channels.cache.get(s.channel_id);
        const message = s.message_id ? await channel?.messages?.fetch(s.message_id) : null;
        // Only the bot's own post is ever deleted
        if (message && message.author?.id === interaction.client?.user?.id) await message.delete();
      } catch {
        // the message may be gone already; the suggestion is removed in the records either way
      }
      return reply(lines.removed(id));
    }

    // gui
    const settings = getSection(guildId, "suggest");
    if (!settings.enabled || !settings.channelId) return reply(lines.notSetup);
    const body = cleanSuggestion(interaction.options.getString("noidung"));
    if (!body) return reply(lines.badBody);
    const channel = guild.channels.cache.get(settings.channelId);
    if (!channel?.send || !CHANNEL_TYPES.includes(channel.type)) return reply(lines.noChannel);
    const missing = missingInChannel(channel, guild.members?.me);
    if (missing.length) return reply(lines.missingPerms(missing));
    const rate = checkRate(recentTimes(guildId, interaction.user.id, now), now);
    if (!rate.ok) return reply(rate.reason === "fast" ? lines.tooFast(rate.waitSec) : lines.tooManyToday(rate.max));

    // The row exists before the post, so two quick uses cannot both pass the limit
    const id = createSuggestion({ guildId, channelId: channel.id, userId: interaction.user.id, body, now });
    try {
      const sent = await channel.send(buildSuggestionPayload(getSuggestion(id), { up: 0, down: 0 }));
      setMessage(id, sent.id);
    } catch {
      discardSuggestion(id);
      return reply(lines.postFailed);
    }
    return reply(lines.sent(id, channel.id));
  },

  // Buttons gopy:up|down|ok|no|done:<id> and modal gopy:m:<action>:<id>
  async handleComponent(interaction, parts) {
    return handleSuggestPress(interaction, parts);
  },
};
