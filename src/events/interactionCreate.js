import { Events, MessageFlags } from "discord.js";
import { loadRecord } from "../store.js";
import { alert } from "../alerts.js";
import { handleBlueprint } from "../ui/editor.js";

async function reportError(interaction, error) {
  console.error("Interaction error:", error);
  alert(`Lỗi tương tác ${interaction.commandName ?? interaction.customId}: ${error.message}`);
  const payload = { content: "Có biến, thầu đang gọi thợ sửa. Thử lại sau chút nha.", flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
}

async function toggleRole(interaction, roleId) {
  // Only roles the bot itself recorded as self-assignable, so a forged button id cannot grant anything else
  if (!loadRecord(interaction.guildId).pickRoles.includes(roleId)) {
    return interaction.reply({ content: "Role này không còn trong danh sách xin role nữa.", flags: MessageFlags.Ephemeral });
  }
  const member = interaction.member;
  const has = member.roles.cache.has(roleId);
  await (has ? member.roles.remove(roleId) : member.roles.add(roleId));
  await interaction.reply({ content: has ? "Đã bỏ role. Bạn lại vô danh rồi." : "Đã cấp role. Chúc mừng, bạn có thêm màu.", flags: MessageFlags.Ephemeral });
}

export default {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        await client.commands.get(interaction.commandName)?.execute(interaction);
      } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const [scope, ...rest] = interaction.customId.split(":");
        if (scope === "bp") await handleBlueprint(interaction, rest);
        else if (interaction.isButton() && scope === "pickrole") await toggleRole(interaction, rest[0]);
        else if (interaction.isButton()) await client.commands.get(scope)?.handleButton?.(interaction, rest);
      }
    } catch (error) {
      await reportError(interaction, error);
    }
  },
};
