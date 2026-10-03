import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { onboardingLines, welcomeDefaults } from "../humor/onboarding.js";

// Server names are typed by strangers, so markdown and mention syntax are defused before they land in a message
export const escapeText = (value) =>
  String(value ?? "")
    .replace(/[\\*_~`|>]/g, "\\$&")
    .replace(/@/g, "@​")
    .replace(/</g, "<​");

// One pass over the template: a placeholder that appears inside a substituted value is never expanded again
export function formatWelcome(template, { userId, serverName, rng = Math.random }) {
  const source = typeof template === "string" && template.trim() ? template : welcomeDefaults[Math.floor(rng() * welcomeDefaults.length)];
  return source.replace(/\{(user|server)\}/gi, (_, key) => (key.toLowerCase() === "user" ? `<@${userId}>` : escapeText(serverName))).slice(0, 2000);
}

export const wantsVerify = (settings) => Boolean(settings.verifyEnabled && settings.verifyRoleId);

export function verifyRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`chaomung:verify:${userId}`).setLabel(onboardingLines.verifyButton).setStyle(ButtonStyle.Success),
  );
}

// The message posted for a new member. Only that member can be pinged, whatever the template says.
// On the free plan a small line under the message says who set the welcome up
export const CREDIT_LINE = "-# Lời chào do Thầu Xây Dựng lo";

export function buildWelcomePost(settings, { userId, serverName, rng, credit = false }) {
  let content = formatWelcome(settings.message, { userId, serverName, rng });
  const payload = { allowedMentions: { parse: [], users: [userId] } };
  if (wantsVerify(settings)) {
    content = `${content}\n\n${onboardingLines.verifyHint}`.slice(0, 2000);
    payload.components = [verifyRow(userId)];
  }
  payload.content = credit ? `${content}
${CREDIT_LINE}`.slice(0, 2000) : content;
  return payload;
}
