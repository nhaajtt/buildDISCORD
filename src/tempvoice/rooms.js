import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import { alert } from "../alerts.js";
import { getSection } from "../settings.js";
import { getPlan } from "../license.js";
import { lines } from "../humor/tempvoice.js";
import { COOLDOWN_MS, NEEDED, ROOM_CAP, SWEEP_GRACE_MS, activeLobbies, createCooldown, ownerOverwrite, roomName } from "./rules.js";
import { allRooms, countRooms, forgetRoom, getRoom, recordRoom } from "./store.js";

const DAY = 24 * 60 * 60 * 1000;
const NOTICE_GAP_MS = 10 * 60 * 1000;
const MAX_IN_CATEGORY = 50;
const SWEEP_PER_TICK = 50;
const UNKNOWN_CHANNEL = 10003;

const cooldown = createCooldown({ ms: COOLDOWN_MS });
// People whose room is being made right now, so a double join cannot make two
const busy = new Set();
// One notice per person per 10 minutes, so a broken setup cannot turn into a stream of messages
const noticed = createCooldown({ ms: NOTICE_GAP_MS, keep: 500 });
// Rooms being created right now per server and per category, so a burst of joins cannot slip past the caps between check and create
const pendingGuild = new Map();
const pendingParent = new Map();
const bump = (map, key, by) => {
  const next = (map.get(key) ?? 0) + by;
  if (next > 0) map.set(key, next);
  else map.delete(key);
};

// The names of what the bot lacks to build a room under `parent` (or anywhere when there is no category)
export function missingToBuild(guild, parent = null) {
  const me = guild.members?.me;
  if (!me) return NEEDED.map(([, label]) => label);
  return NEEDED.filter(([flag]) => {
    const perms = (flag === "ManageRoles" ? null : parent?.permissionsFor?.(me)) ?? me.permissions;
    return !perms?.has?.(P[flag]);
  }).map(([, label]) => label);
}

// The category rooms go into: the one the admin chose, else the lobby's own, else none
function parentFor(guild, settings, lobby) {
  const chosen = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
  if (chosen?.type === ChannelType.GuildCategory) return chosen;
  const own = lobby.parentId ? guild.channels.cache.get(lobby.parentId) : null;
  return own?.type === ChannelType.GuildCategory ? own : null;
}

// A new channel with its own overwrites does not follow its category, so the category's overwrites are copied first
// and the owner's few rights are added on top. Nobody else gets anything new.
function overwritesFor(parent, ownerId) {
  const list = [];
  for (const o of parent?.permissionOverwrites?.cache?.values?.() ?? []) {
    if (o.id !== ownerId) list.push({ id: o.id, type: o.type, allow: o.allow, deny: o.deny });
  }
  list.push(ownerOverwrite(ownerId));
  return list;
}

async function tell(guild, member, text, why) {
  alert(lines.alertFail(guild.name, why));
  if (!noticed.take(`${guild.id}:${member.id}`, Date.now())) return;
  try {
    await member.send?.(text);
  } catch {
    // direct messages may be closed; the alert above is enough
  }
}

async function dropRoom(channel) {
  try {
    await channel.delete(lines.reasonCleanup);
  } catch (error) {
    if (error?.code !== UNKNOWN_CHANNEL) return false;
  }
  forgetRoom(channel.id);
  return true;
}

// Deletes a room the bot made once nobody is in it. Anything that is not a recorded room is left alone.
export async function removeIfEmpty(guild, channelId) {
  const row = getRoom(channelId);
  if (!row || row.guild_id !== guild.id) return false;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    forgetRoom(channelId);
    return false;
  }
  if ((channel.members?.size ?? 1) > 0) return false;
  return dropRoom(channel);
}

async function makeRoom(guild, member, lobby, settings, now) {
  if (countRooms(guild.id) + (pendingGuild.get(guild.id) ?? 0) >= ROOM_CAP) {
    await tell(guild, member, lines.failCap(ROOM_CAP), `đã đủ ${ROOM_CAP} phòng tạm`);
    return { ok: false, reason: "cap" };
  }
  const parent = parentFor(guild, settings, lobby);
  const missing = missingToBuild(guild, parent);
  if (missing.length) {
    await tell(guild, member, lines.failMissingPerms(missing), `thiếu quyền ${missing.join(", ")}`);
    return { ok: false, reason: "perms", missing };
  }
  if (parent) {
    let inside = 0;
    for (const c of guild.channels.cache.values()) if (c.parentId === parent.id) inside += 1;
    if (inside + (pendingParent.get(parent.id) ?? 0) >= MAX_IN_CATEGORY) {
      await tell(guild, member, lines.failCategoryFull, "danh mục đã đầy kênh");
      return { ok: false, reason: "full" };
    }
  }

  let channel;
  bump(pendingGuild, guild.id, 1);
  if (parent) bump(pendingParent, parent.id, 1);
  try {
    channel = await guild.channels.create({
      name: roomName(settings.nameTemplate, member.displayName),
      type: ChannelType.GuildVoice,
      parent: parent?.id,
      userLimit: settings.userLimit || undefined,
      permissionOverwrites: overwritesFor(parent, member.id),
      reason: lines.reason,
    });
  } catch (error) {
    bump(pendingGuild, guild.id, -1);
    if (parent) bump(pendingParent, parent.id, -1);
    await tell(guild, member, lines.failGeneric, `không dựng được phòng (${error?.message ?? "lỗi lạ"})`);
    return { ok: false, reason: "create" };
  }
  // Recorded before the move, so a crash in between leaves a row the sweep can clean up
  recordRoom({ channelId: channel.id, guildId: guild.id, ownerId: member.id, now });
  bump(pendingGuild, guild.id, -1);
  if (parent) bump(pendingParent, parent.id, -1);

  // The person may have left the lobby while the room was being made
  if (guild.voiceStates?.cache?.get(member.id)?.channelId !== lobby.id) {
    await dropRoom(channel);
    return { ok: false, reason: "left" };
  }
  try {
    await member.voice.setChannel(channel, lines.reason);
  } catch (error) {
    await dropRoom(channel);
    if (error?.code === 40032) return { ok: false, reason: "left" };
    await tell(guild, member, lines.failGeneric, `không chuyển được người vào phòng (${error?.message ?? "lỗi lạ"})`);
    return { ok: false, reason: "move" };
  }
  return { ok: true, channelId: channel.id };
}

// voiceStateUpdate: clears the room somebody just left if it is now empty, and makes a room for someone who joined a lobby
export async function handleVoiceUpdate(oldState, newState, { now = Date.now() } = {}) {
  const guild = newState?.guild ?? oldState?.guild;
  if (!guild) return { action: "none" };
  const before = oldState?.channelId ?? null;
  const after = newState?.channelId ?? null;
  if (before === after) return { action: "none" };

  const result = { action: "none" };
  if (before && (await removeIfEmpty(guild, before))) result.removed = before;

  const member = newState?.member ?? oldState?.member;
  if (!after || !member || member.user?.bot) return result;
  const settings = getSection(guild.id, "tempvoice");
  if (!settings.enabled) return result;
  if (!activeLobbies(settings.lobbyChannelIds, getPlan(guild.id).tempLobbies).includes(after)) return result;
  const lobby = guild.channels.cache.get(after);
  if (!lobby) return result;

  const key = `${guild.id}:${member.id}`;
  if (busy.has(key)) return { ...result, action: "busy" };
  if (!cooldown.take(key, now)) return { ...result, action: "cooldown" };
  busy.add(key);
  try {
    return { ...result, action: "create", ...(await makeRoom(guild, member, lobby, settings, now)) };
  } finally {
    busy.delete(key);
  }
}

// Forgets rows for rooms that no longer exist and deletes recorded rooms that are empty. Only rows in temp_voice are ever looked at.
export async function sweepTempVoice(client, { now = Date.now() } = {}) {
  let removed = 0;
  let forgotten = 0;
  for (const row of allRooms()) {
    if (removed >= SWEEP_PER_TICK) break;
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) {
        // A server the bot is no longer in: its channels are not ours to touch, the row is dropped after a week
        if (now - row.created_at > 7 * DAY) forgotten += forgetRoom(row.channel_id);
        continue;
      }
      if (guild.available === false) continue;
      let channel = guild.channels.cache.get(row.channel_id);
      if (!channel) {
        try {
          channel = await guild.channels.fetch(row.channel_id);
        } catch (error) {
          if (error?.code !== UNKNOWN_CHANNEL) continue;
          channel = null;
        }
      }
      if (!channel || !channel.isVoiceBased?.() || (channel.guildId ?? channel.guild?.id) !== guild.id) {
        forgotten += forgetRoom(row.channel_id);
        continue;
      }
      if (now - row.created_at < SWEEP_GRACE_MS || (channel.members?.size ?? 1) > 0) continue;
      if (await dropRoom(channel)) removed += 1;
    } catch (error) {
      console.error(`Temp room ${row.channel_id} sweep failed:`, error.message);
    }
  }
  return { removed, forgotten };
}
