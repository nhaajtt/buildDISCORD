// Cleans user-typed text before it is stored or shown: no control or direction-override characters, one line, capped length.
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(BAD, "").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

// Breaks mention syntax so text echoed in a plain message can never ping, even if allowedMentions were loosened by mistake
export function defang(value) {
  return String(value).replace(/@(everyone|here)/gi, "@​$1").replace(/<@/g, "<​@");
}

export const MINUTE = 60_000;
export const DURATIONS = [
  { name: "10 phút", value: 10 },
  { name: "1 giờ", value: 60 },
  { name: "1 ngày", value: 1440 },
  { name: "3 ngày", value: 4320 },
  { name: "1 tuần", value: 10080 },
];

// Minutes from a choice, or null when it is not one of the offered durations
export function durationMs(minutes) {
  const found = DURATIONS.find((d) => d.value === minutes);
  return found ? found.value * MINUTE : null;
}
