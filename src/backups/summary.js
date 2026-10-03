import { backupLines } from "../humor/backup.js";

const list = (items, label, max = 8) => {
  if (!items.length) return "";
  const shown = items.slice(0, max).map((i) => `• ${i.name}`).join("\n");
  const more = items.length > max ? `\n... và ${items.length - max} cái nữa` : "";
  return `\n**${label}** (${items.length})\n${shown}${more}`;
};

// What the confirmation shows before a restore: exactly what will be created, and which permissions are held back
export function restoreSummary(name, plan, foreign) {
  const { roles, categories, channels } = plan;
  const lines = [
    `Bản sao lưu **${name}**. Thầu chỉ **thêm** những gì còn thiếu, không xoá và không sửa cái đã có.`,
    list(roles.missing, "Role sẽ tạo"),
    list(categories.missing, "Danh mục sẽ tạo"),
    list(channels.missing, "Kênh sẽ tạo"),
    "",
    `Đã có sẵn, bỏ qua: ${roles.present.length} role, ${categories.present.length} danh mục, ${channels.present.length} kênh.`,
    backupLines.adminNote,
  ];
  if (foreign) lines.push(backupLines.foreignNote);
  return lines.filter((l) => l !== undefined).join("\n").slice(0, 4000);
}

export const progressBar = (done, total) => {
  const filled = Math.round((done / total) * 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${Math.round((done / total) * 100)}%`;
};
