import { BackupError, LIMITS, SNAPSHOT_VERSION } from "./snapshot.js";

// Everything that comes from a file or from the database is rebuilt from scratch here: only known fields survive, every type and size is checked,
// and anything hostile throws instead of being trimmed into something that merely looks fine.

const PERMISSION_MAX = (1n << 64n) - 1n;
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function text(value, label, { max = LIMITS.name, min = 1 } = {}) {
  if (typeof value !== "string") throw new BackupError(`${label}: not text`);
  // Control characters and newlines have no place in a channel or role name
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length < min || cleaned.length > max) throw new BackupError(`${label}: bad length`);
  return cleaned;
}

function permission(value, label) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) throw new BackupError(`${label}: not a permission number`);
  const bits = BigInt(value);
  if (bits > PERMISSION_MAX) throw new BackupError(`${label}: permission number too large`);
  return bits.toString();
}

function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new BackupError(`${label}: out of range`);
  return value;
}

function array(value, label, max) {
  if (!Array.isArray(value)) throw new BackupError(`${label}: not a list`);
  if (value.length > max) throw new BackupError(`${label}: too many entries`);
  return value;
}

function overwrites(value, label, roleNames) {
  const out = [];
  for (const [i, raw] of array(value ?? [], label, LIMITS.overwritesPerTarget).entries()) {
    if (!isPlainObject(raw)) throw new BackupError(`${label}[${i}]: not an object`);
    const role = text(raw.role, `${label}[${i}].role`);
    // An overwrite for a role the snapshot does not contain cannot be restored, so it is left out
    if (role !== "@everyone" && !roleNames.has(role)) continue;
    out.push({ role, allow: permission(raw.allow, `${label}[${i}].allow`), deny: permission(raw.deny, `${label}[${i}].deny`) });
  }
  return out;
}

export function validateSnapshot(raw) {
  if (!isPlainObject(raw)) throw new BackupError("the file is not a backup");
  if (raw.version !== SNAPSHOT_VERSION) throw new BackupError("unsupported backup version");

  const roles = [];
  const roleNames = new Set();
  for (const [i, r] of array(raw.roles, "roles", LIMITS.roles).entries()) {
    if (!isPlainObject(r)) throw new BackupError(`roles[${i}]: not an object`);
    const name = text(r.name, `roles[${i}].name`);
    if (roleNames.has(name)) continue;
    roleNames.add(name);
    roles.push({
      name,
      color: integer(r.color ?? 0, `roles[${i}].color`, 0, 0xffffff),
      hoist: r.hoist === true,
      mentionable: r.mentionable === true,
      permissions: permission(r.permissions ?? "0", `roles[${i}].permissions`),
    });
  }

  const categories = [];
  const categoryNames = new Set();
  for (const [i, c] of array(raw.categories, "categories", LIMITS.categories).entries()) {
    if (!isPlainObject(c)) throw new BackupError(`categories[${i}]: not an object`);
    const name = text(c.name, `categories[${i}].name`);
    if (categoryNames.has(name)) continue;
    categoryNames.add(name);
    categories.push({ name, overwrites: overwrites(c.overwrites, `categories[${i}].overwrites`, roleNames) });
  }

  const channels = [];
  const seen = new Set();
  const rawChannels = array(raw.channels, "channels", LIMITS.channelsTotal);
  if (categories.length + rawChannels.length > LIMITS.channelsTotal) throw new BackupError("too many channels");
  for (const [i, ch] of rawChannels.entries()) {
    if (!isPlainObject(ch)) throw new BackupError(`channels[${i}]: not an object`);
    if (ch.type !== "text" && ch.type !== "voice") throw new BackupError(`channels[${i}].type: unknown`);
    const name = text(ch.name, `channels[${i}].name`);
    let parent = null;
    if (ch.parent !== null && ch.parent !== undefined) {
      parent = text(ch.parent, `channels[${i}].parent`);
      if (!categoryNames.has(parent)) throw new BackupError(`channels[${i}].parent: no such category`);
    }
    const key = `${ch.type}|${parent}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { name, type: ch.type, parent, overwrites: overwrites(ch.overwrites, `channels[${i}].overwrites`, roleNames) };
    if (ch.type === "voice") {
      entry.bitrate = integer(ch.bitrate ?? 64000, `channels[${i}].bitrate`, 8000, 384000);
      entry.userLimit = integer(ch.userLimit ?? 0, `channels[${i}].userLimit`, 0, 99);
    } else {
      if (ch.topic !== undefined && ch.topic !== "") entry.topic = text(ch.topic, `channels[${i}].topic`, { max: LIMITS.topic });
      entry.nsfw = ch.nsfw === true;
      entry.rateLimitPerUser = integer(ch.rateLimitPerUser ?? 0, `channels[${i}].rateLimitPerUser`, 0, 21600);
    }
    channels.push(entry);
  }

  const takenAt = Number.isFinite(raw.takenAt) && raw.takenAt >= 0 ? Math.floor(raw.takenAt) : 0;
  // A missing or odd source id is treated as "from somewhere else", which is the cautious reading
  const sourceGuildId = typeof raw.sourceGuildId === "string" && /^\d{5,25}$/.test(raw.sourceGuildId) ? raw.sourceGuildId : "";
  return {
    version: SNAPSHOT_VERSION,
    takenAt,
    sourceGuildId,
    counts: { roles: roles.length, categories: categories.length, channels: channels.length },
    roles,
    categories,
    channels,
  };
}

// Text from an uploaded file: size first, then JSON, then the strict check
export function parseSnapshotFile(textContent) {
  if (typeof textContent !== "string" || Buffer.byteLength(textContent) > LIMITS.bytes) throw new BackupError("file too large");
  let raw;
  try {
    raw = JSON.parse(textContent);
  } catch {
    throw new BackupError("not valid JSON");
  }
  return validateSnapshot(raw);
}
