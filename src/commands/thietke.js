import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { AiError, aiEnabled } from "../ai/gemini.js";
import { HUMOR_LEVELS, designServer } from "../ai/designer.js";
import { DesignError } from "../ai/validate.js";
import { addUsage, getPlan, getUsage } from "../license.js";
import { composePlan } from "../themes/index.js";
import { isAdmin, missingBotPermissions } from "../utils/guards.js";
import { openEditor } from "../ui/editor.js";
import * as humor from "../humor/lines.js";

const failure = {
  key: "AI đang bị từ chối (khoá API có vấn đề). Chủ bot cần kiểm tra lại. Lượt của bạn không bị tính.",
  quota: "AI hết hạn mức hôm nay, nó đi ngủ rồi. Thử lại sau hoặc dùng `/build` với theme có sẵn. Lượt của bạn không bị tính.",
  busy: "Nhiều người đang nhờ AI cùng lúc, đợi một phút rồi gõ lại nhé. Lượt của bạn không bị tính.",
  bad: "AI nghĩ ra thứ không dùng được. Thử mô tả rõ hơn, hoặc dùng `/build` với theme có sẵn. Lượt của bạn không bị tính.",
};

export default {
  data: new SlashCommandBuilder()
    .setName("thietke")
    .setDescription("Mô tả nhóm của bạn, AI thiết kế server riêng (gói Pro trở lên)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName("mota").setDescription("Nhóm bạn là ai, thích gì? Ví dụ: 8 người, chơi Valorant, hay tám chuyện").setRequired(true).setMinLength(10).setMaxLength(400),
    )
    .addStringOption((option) =>
      option
        .setName("muc-do-hai")
        .setDescription("Mức hài (mặc định: troll)")
        .addChoices({ name: "Nhẹ nhàng", value: "nhe" }, { name: "Troll", value: "troll" }, { name: "Siêu nhảm", value: "nham" }),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));

    const plan = getPlan(interaction.guildId);
    if (!plan.aiPerMonth) return reply("Thiết kế bằng AI là của gói Pro trở lên. Gõ `/goi` để xem cách nâng cấp.");
    if (!aiEnabled()) return reply("AI chưa được bật trên bot này. Chủ bot cần dán khoá API vào cấu hình.");
    if (getUsage(interaction.guildId, "ai") >= plan.aiPerMonth) {
      return reply(`Tháng này server đã dùng hết ${plan.aiPerMonth} lượt AI của gói ${plan.label}. Qua tháng mới được cấp lại, hoặc dùng \`/build\` với theme có sẵn.`);
    }
    const missing = missingBotPermissions(interaction.guild);
    if (missing.length) return reply(humor.missingBotPermsLine(missing));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const level = interaction.options.getString("muc-do-hai") ?? "troll";
    try {
      const theme = await designServer({ description: interaction.options.getString("mota"), humor: level });
      addUsage(interaction.guildId, "ai");
      const planned = composePlan([theme]);
      await openEditor(interaction, planned, {
        deferred: true,
        note: `AI đã thiết kế xong (giọng ${HUMOR_LEVELS[level] ? level : "troll"}). Xem, sửa, rồi bấm xây.`,
      });
    } catch (error) {
      if (!(error instanceof AiError) && !(error instanceof DesignError)) console.error("Design failed:", error);
      const kind = error instanceof AiError ? error.kind : "bad";
      await interaction.editReply({ content: failure[kind] ?? failure.bad });
    }
  },
};
