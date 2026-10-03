// A fake Discord gateway for end-to-end tests.
//
// It builds a client, guilds, members, roles, channels and interactions that behave like discord.js for everything the bot touches,
// loads the commands and events exactly the way src/index.js does, and delivers events and interactions to the REAL modules.
// Everything the bot does to Discord (replies, edits, sends, role changes, overwrites, bans, timeouts, ...) is written to
// `gateway.records`, so a test asserts on what a person (or Discord) would have seen.
//
// Rules of the fake that mirror Discord:
//  - a reply can only be given once, edits need a reply or a defer, `update` is only for components;
//  - payloads are validated (content, embeds, components, ids and labels) and a bad one is refused like Discord does;
//  - a button, menu or modal can only be used if the bot actually posted it and it is not disabled;
//  - slash command options are validated against the command's own JSON (names, types, ranges, choices);
//  - a bot cannot touch roles at or above its own highest role;
//  - message content is empty, and every read of it is counted, because the bot has no privileged intent.
//
// The clock is frozen and injectable: Date.now is replaced before any module under src is loaded, so cooldowns, windows and jobs
// all follow `gateway.clock`.

import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuditLogEvent, ChannelType, Collection, Events, MessageFlags, MessageType, PermissionFlagsBits as P, PermissionsBitField } from "discord.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "..", "..", "src");

export const BASE_TIME = Date.UTC(2026, 9, 3, 12, 0, 0);
const DISCORD_EPOCH = 1420070400000n;
const realNow = Date.now.bind(Date);
export const CRASH_TEXT = "Có biến, thầu đang gọi thợ sửa";

// ---------------------------------------------------------------- small helpers

export function apiError(code, message, status = 400) {
  return Object.assign(new Error(message), { name: "DiscordAPIError", code, status });
}

const ALL = new PermissionsBitField(PermissionsBitField.All);
const perms = (list = []) => new PermissionsBitField(list.map((name) => (typeof name === "string" ? P[name] : name)));
const everyoneDefault = ["ViewChannel", "SendMessages", "EmbedLinks", "ReadMessageHistory", "Connect", "Speak", "AddReactions", "UseExternalEmojis"];

const jsonOf = (x) => (x && typeof x.toJSON === "function" ? x.toJSON() : x);

function toBits(value) {
  if (value instanceof PermissionsBitField) return new PermissionsBitField(value.bitfield);
  return new PermissionsBitField(value ?? 0n);
}

// ---------------------------------------------------------------- payloads

const MAX_CONTENT = 2000;

function embedSize(e) {
  let n = (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text?.length ?? 0) + (e.author?.name?.length ?? 0);
  for (const f of e.fields ?? []) n += f.name.length + f.value.length;
  return n;
}

// Turns a payload with builders into plain JSON and refuses what Discord would refuse
export function plainPayload(input, { allowEmpty = false, label = "message" } = {}) {
  const raw = typeof input === "string" ? { content: input } : { ...(input ?? {}) };
  const out = { ...raw };
  const bad = (why) => {
    throw apiError(50035, `Invalid Form Body (${label}): ${why}`);
  };
  if (raw.embeds !== undefined) out.embeds = raw.embeds.map(jsonOf);
  if (raw.components !== undefined) out.components = raw.components.map(jsonOf);
  if (out.content !== undefined && out.content !== null && String(out.content).length > MAX_CONTENT) bad(`content is ${String(out.content).length} characters`);
  if (out.embeds) {
    if (out.embeds.length > 10) bad("more than 10 embeds");
    let total = 0;
    for (const e of out.embeds) {
      if ((e.title?.length ?? 0) > 256) bad("embed title over 256");
      if ((e.description?.length ?? 0) > 4096) bad("embed description over 4096");
      if ((e.fields?.length ?? 0) > 25) bad("more than 25 embed fields");
      for (const f of e.fields ?? []) {
        if (!f.name || !f.value) bad("empty embed field");
        if (f.name.length > 256 || f.value.length > 1024) bad("embed field too long");
      }
      if ((e.footer?.text?.length ?? 0) > 2048) bad("embed footer over 2048");
      total += embedSize(e);
    }
    if (total > 6000) bad(`embeds total ${total} characters`);
  }
  if (out.components) {
    if (out.components.length > 5) bad("more than 5 action rows");
    const seen = new Set();
    for (const row of out.components) {
      const parts = row.components ?? [];
      if (!parts.length) bad("empty action row");
      const buttons = parts.filter((c) => c.type === 2);
      if (buttons.length && buttons.length !== parts.length) bad("a row mixes buttons with other components");
      if (buttons.length > 5) bad("more than 5 buttons in a row");
      if (!buttons.length && parts.length !== 1) bad("a menu must be alone in its row");
      for (const c of parts) {
        if (c.type === 2) {
          if (c.style === 5) {
            if (!c.url || c.custom_id) bad("a link button needs a url and no custom id");
          } else if (!c.custom_id) bad("a button needs a custom id");
          if (!c.label && !c.emoji) bad("a button needs a label or an emoji");
          if ((c.label?.length ?? 0) > 80) bad("button label over 80");
        } else if (c.type === 3) {
          if (!c.options?.length || c.options.length > 25) bad("a menu needs 1 to 25 options");
          if ((c.max_values ?? 1) > c.options.length && (c.max_values ?? 1) > 25) bad("max_values too large");
          if ((c.min_values ?? 1) > (c.max_values ?? 1)) bad("min_values over max_values");
          for (const o of c.options) {
            if (!o.label || o.label.length > 100 || !o.value || o.value.length > 100) bad("menu option label or value out of range");
            if ((o.description?.length ?? 0) > 100) bad("menu option description over 100");
          }
          if (c.options.filter((o) => o.default).length > (c.max_values ?? 1)) bad("more defaults than max_values");
          if (new Set(c.options.map((o) => o.value)).size !== c.options.length) bad("duplicate menu values");
        }
        if (c.custom_id) {
          if (c.custom_id.length > 100) bad(`custom id over 100: ${c.custom_id}`);
          if (seen.has(c.custom_id)) bad(`duplicate custom id ${c.custom_id}`);
          seen.add(c.custom_id);
        }
      }
    }
  }
  if (!allowEmpty && !out.content && !(out.embeds?.length) && !(out.components?.length) && !out.files?.length) {
    throw apiError(50006, "Cannot send an empty message");
  }
  return out;
}

// All the readable text of a payload: content, embeds, button labels, menu texts
export function textOf(payload) {
  if (!payload) return "";
  const parts = [];
  if (payload.content) parts.push(payload.content);
  for (const e of payload.embeds ?? []) {
    const j = jsonOf(e);
    parts.push(j.title ?? "", j.description ?? "", j.footer?.text ?? "");
    for (const f of j.fields ?? []) parts.push(f.name, f.value);
  }
  for (const row of payload.components ?? []) {
    for (const c of jsonOf(row).components ?? []) {
      parts.push(c.label ?? "", c.placeholder ?? "");
      for (const o of c.options ?? []) parts.push(o.label, o.description ?? "");
    }
  }
  return parts.filter(Boolean).join("\n");
}

export const componentsOf = (payload) => (payload?.components ?? []).flatMap((row) => jsonOf(row).components ?? []);
export const customIdsOf = (payload) => componentsOf(payload).map((c) => c.custom_id).filter(Boolean);

// ---------------------------------------------------------------- clock

function makeClock(start) {
  let current = start;
  return {
    now: () => current,
    set(ms) {
      current = ms;
    },
    advance(ms) {
      current += ms;
      return current;
    },
  };
}

// ---------------------------------------------------------------- users, roles, members

class FakeUser {
  constructor(gw, { id = gw.sf(), username = `user${id.slice(-4)}`, bot = false, dmOpen = true } = {}) {
    this.gw = gw;
    this.id = id;
    this.username = username;
    this.globalName = username;
    this.bot = bot;
    this.dmOpen = dmOpen;
  }

  get tag() {
    return `${this.username}#0`;
  }

  async send(payload) {
    if (!this.dmOpen) throw apiError(50007, "Cannot send messages to this user", 403);
    const plain = plainPayload(payload, { label: "dm" });
    this.gw.record("dm", { userId: this.id, payload: plain });
    return { id: this.gw.sf() };
  }
}

class FakeRole {
  constructor(guild, { id = guild.gw.sf(), name, permissions = 0n, position = 1, managed = false, color = 0, hoist = false, mentionable = false }) {
    this.guild = guild;
    this.client = guild.client;
    this.id = id;
    this.name = name;
    this.permissions = toBits(permissions);
    this.position = position;
    this.managed = managed;
    this.color = color;
    this.hoist = hoist;
    this.mentionable = mentionable;
  }

  get isEveryone() {
    return this.id === this.guild.id;
  }

  get editable() {
    const me = this.guild.members.me;
    if (this.managed || this.isEveryone || !me) return false;
    return me.permissions.has(P.ManageRoles) && this.position < me.roles.highest.position;
  }

  async delete(reason) {
    this.guild._removeRole(this, this.guild.client.user.id, reason);
  }
}

class MemberRoles {
  constructor(member) {
    this.member = member;
    this.cache = new Collection();
  }

  get highest() {
    return [...this.cache.values()].reduce((a, b) => (b.position > a.position ? b : a));
  }

  _resolve(input) {
    const list = input instanceof Collection ? [...input.values()] : Array.isArray(input) ? input : [input];
    return list.map((x) => {
      const role = typeof x === "string" ? this.member.guild.roles.cache.get(x) : x;
      if (!role) throw apiError(10011, "Unknown Role", 404);
      return role;
    });
  }

  _assertAssignable(role) {
    const guild = this.member.guild;
    const me = guild.members.me;
    if (!me?.permissions.has(P.ManageRoles)) throw apiError(50013, "Missing Permissions", 403);
    if (role.managed || role.isEveryone || role.position >= me.roles.highest.position) throw apiError(50013, "Missing Permissions", 403);
  }

  async add(input, reason) {
    for (const role of this._resolve(input)) {
      this._assertAssignable(role);
      this.cache.set(role.id, role);
      this.member.guild.gw.record("roleAdd", { guildId: this.member.guild.id, userId: this.member.id, roleId: role.id, roleName: role.name, reason });
    }
    return this.member;
  }

  async remove(input, reason) {
    for (const role of this._resolve(input)) {
      this._assertAssignable(role);
      this.cache.delete(role.id);
      this.member.guild.gw.record("roleRemove", { guildId: this.member.guild.id, userId: this.member.id, roleId: role.id, roleName: role.name, reason });
    }
    return this.member;
  }
}

class FakeMember {
  constructor(guild, user, roles = []) {
    this.guild = guild;
    this.user = user;
    this.id = user.id;
    this.nickname = null;
    this.communicationDisabledUntilTimestamp = null;
    this.roles = new MemberRoles(this);
    this.roles.cache.set(guild.id, guild.roles.everyone);
    for (const role of roles) this.roles.cache.set(role.id, role);
  }

  get displayName() {
    return this.nickname ?? this.user.globalName ?? this.user.username;
  }

  get permissions() {
    if (this.id === this.guild.ownerId) return new PermissionsBitField(ALL);
    const bits = new PermissionsBitField();
    for (const role of this.roles.cache.values()) bits.add(role.permissions);
    return bits.has(P.Administrator) ? new PermissionsBitField(ALL) : bits;
  }

  // The checks discord.js makes before it lets the bot act on a member
  _botCan(flag) {
    const me = this.guild.members.me;
    if (!me || this.id === this.guild.ownerId || this.id === me.id) return false;
    return me.permissions.has(flag) && me.roles.highest.position > this.roles.highest.position;
  }

  get manageable() {
    return this._botCan(P.ManageRoles);
  }

  get kickable() {
    return this._botCan(P.KickMembers);
  }

  get bannable() {
    return this._botCan(P.BanMembers);
  }

  get moderatable() {
    return this._botCan(P.ModerateMembers) && !this.permissions.has(P.Administrator);
  }

  async timeout(ms, reason) {
    if (!this.moderatable) throw apiError(50013, "Missing Permissions", 403);
    this.communicationDisabledUntilTimestamp = ms === null ? null : this.guild.gw.clock.now() + ms;
    this.guild.gw.record("timeout", { guildId: this.guild.id, userId: this.id, ms, reason });
    return this;
  }

  async kick(reason) {
    if (!this.kickable) throw apiError(50013, "Missing Permissions", 403);
    this.guild.members.cache.delete(this.id);
    this.guild.gw.record("kick", { guildId: this.guild.id, userId: this.id, reason });
  }

  async send(payload) {
    return this.user.send(payload);
  }
}

// ---------------------------------------------------------------- messages

class BotMessage {
  constructor(gw, { channel, author, payload, ephemeralFor = null, interactionId = null }) {
    this.gw = gw;
    this.id = gw.sf();
    this.channel = channel;
    this.channelId = channel?.id ?? null;
    this.guild = channel?.guild ?? null;
    this.guildId = this.guild?.id ?? null;
    this.author = author;
    this.member = null;
    this.type = MessageType.Default;
    this.system = false;
    this.webhookId = null;
    this.ephemeralFor = ephemeralFor;
    this.interactionId = interactionId;
    this.createdTimestamp = gw.clock.now();
    this.payload = { content: "", embeds: [], components: [] };
    this.history = [];
    this._merge(payload);
  }

  _merge(plain) {
    for (const key of ["content", "embeds", "components", "allowedMentions", "flags"]) if (plain[key] !== undefined) this.payload[key] = plain[key];
    this.history.push(structuredClone({ ...this.payload }));
  }

  get content() {
    return this.payload.content ?? "";
  }

  get embeds() {
    return this.payload.embeds;
  }

  get components() {
    return this.payload.components;
  }

  async edit(payload) {
    const plain = plainPayload(payload, { allowEmpty: true, label: "edit" });
    this._merge(plain);
    this.gw.record("messageEdit", { messageId: this.id, channelId: this.channelId, payload: plain });
    return this;
  }

  async delete() {
    this.channel?.messages.cache.delete(this.id);
    this.deleted = true;
  }
}

// What a MessageCreate event carries. The bot has no message content intent, so content is empty and every read is counted.
class IncomingMessage {
  constructor(gw, { channel, author, member = null, type = MessageType.Default, id = gw.sf() }) {
    this.id = id;
    this.channel = channel;
    this.channelId = channel.id;
    this.guild = channel.guild;
    this.guildId = channel.guild.id;
    this.author = author;
    this.member = member;
    this.type = type;
    this.system = type !== MessageType.Default && type !== MessageType.Reply;
    this.webhookId = null;
    this.createdTimestamp = gw.clock.now();
    this.client = gw.client;
    Object.defineProperty(this, "content", {
      enumerable: true,
      get: () => {
        gw.contentReads += 1;
        return "";
      },
    });
  }
}

// ---------------------------------------------------------------- channels

class FakeChannel {
  constructor(guild, { id = guild.gw.sf(), name, type, parentId = null, topic = null, overwrites = [], position = 0 }) {
    this.guild = guild;
    this.client = guild.client;
    this.id = id;
    this.name = name;
    this.type = type;
    this.parentId = parentId;
    this.topic = topic;
    this.rawPosition = position;
    this.lastMessageId = null;
    this.permissionOverwrites = new ChannelOverwrites(this);
    for (const o of overwrites) this.permissionOverwrites.cache.set(o.id, o);
    this.messages = {
      cache: new Collection(),
      fetch: async (id) => {
        const found = this.messages.cache.get(id);
        if (!found) throw apiError(10008, "Unknown Message", 404);
        return found;
      },
    };
  }

  isTextBased() {
    return [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.PublicThread].includes(this.type);
  }

  isVoiceBased() {
    return [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(this.type);
  }

  get manageable() {
    const me = this.guild.members.me;
    return Boolean(me?.permissions.has(P.ManageChannels) && this.permissionsFor(me).has(P.ViewChannel));
  }

  // Base permissions of the target, then the overwrites in Discord's order: @everyone, roles, then the member
  permissionsFor(target) {
    const guild = this.guild;
    const member = target instanceof FakeMember ? target : typeof target === "string" ? guild.members.cache.get(target) : null;
    const role = target instanceof FakeRole ? target : typeof target === "string" && !member ? guild.roles.cache.get(target) : null;
    if (!member && !role) return new PermissionsBitField();
    const base = member ? member.permissions : new PermissionsBitField(role.permissions);
    if (base.has(P.Administrator)) return new PermissionsBitField(ALL);
    const bits = new PermissionsBitField(base);
    const apply = (overwrite) => {
      if (!overwrite) return;
      bits.remove(overwrite.deny);
      bits.add(overwrite.allow);
    };
    apply(this.permissionOverwrites.cache.get(guild.id));
    if (member) {
      const deny = new PermissionsBitField();
      const allow = new PermissionsBitField();
      for (const r of member.roles.cache.values()) {
        const o = r.id === guild.id ? null : this.permissionOverwrites.cache.get(r.id);
        if (o) {
          deny.add(o.deny);
          allow.add(o.allow);
        }
      }
      bits.remove(deny);
      bits.add(allow);
      apply(this.permissionOverwrites.cache.get(member.id));
    } else if (!role.isEveryone) {
      apply(this.permissionOverwrites.cache.get(role.id));
    }
    // Without the right to see a channel nothing else works there
    if (!bits.has(P.ViewChannel)) return new PermissionsBitField();
    return bits;
  }

  async send(input) {
    const gw = this.guild.gw;
    const me = this.guild.members.me;
    const mine = this.permissionsFor(me);
    if (!mine.has(P.ViewChannel) || !mine.has(P.SendMessages)) throw apiError(50013, "Missing Permissions", 403);
    const plain = plainPayload(input, { label: `send to #${this.name}` });
    const message = new BotMessage(gw, { channel: this, author: gw.client.user, payload: plain });
    this.messages.cache.set(message.id, message);
    this.lastMessageId = message.id;
    gw.messages.push(message);
    gw.record("send", { guildId: this.guild.id, channelId: this.id, messageId: message.id, payload: plain });
    return message;
  }

  async delete(reason) {
    this.guild._removeChannel(this, this.guild.client.user.id, reason);
  }
}

// Overwrites are { id, type (0 role, 1 member), allow, deny } with permission bit fields
class ChannelOverwrites {
  constructor(channel) {
    this.channel = channel;
    this.cache = new Collection();
  }

  _idOf(target) {
    return typeof target === "string" ? target : target.id;
  }

  _typeOf(id) {
    return this.channel.guild.roles.cache.has(id) ? 0 : 1;
  }

  async edit(target, options, { reason } = {}) {
    const id = this._idOf(target);
    const existing = this.cache.get(id);
    const before = snapshotOverwrite(existing);
    const next = { id, type: existing?.type ?? this._typeOf(id), allow: toBits(existing?.allow), deny: toBits(existing?.deny) };
    for (const [name, value] of Object.entries(options)) {
      const flag = P[name];
      if (flag === undefined) throw new Error(`Unknown permission ${name}`);
      if (value === true) {
        next.allow.add(flag);
        next.deny.remove(flag);
      } else if (value === false) {
        next.deny.add(flag);
        next.allow.remove(flag);
      } else {
        next.allow.remove(flag);
        next.deny.remove(flag);
      }
    }
    this.cache.set(id, next);
    this.channel.guild.gw.record("overwrite", { guildId: this.channel.guild.id, channelId: this.channel.id, targetId: id, before, after: snapshotOverwrite(next), reason });
    return this.channel;
  }

  async delete(target, reason) {
    const id = this._idOf(target);
    const before = snapshotOverwrite(this.cache.get(id));
    this.cache.delete(id);
    this.channel.guild.gw.record("overwriteDelete", { guildId: this.channel.guild.id, channelId: this.channel.id, targetId: id, before, reason });
    return this.channel;
  }
}

const snapshotOverwrite = (o) => (o ? { id: o.id, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() } : null);

// What the people in the channel are really affected by: overwrites that say nothing are dropped, so an untouched channel and one
// with an emptied overwrite compare equal
export function effectiveOverwrites(channel) {
  const list = [];
  for (const o of channel.permissionOverwrites.cache.values()) {
    if (o.allow.bitfield === 0n && o.deny.bitfield === 0n) continue;
    list.push(`${o.id}:${o.allow.bitfield}:${o.deny.bitfield}`);
  }
  return list.sort();
}

export function overwriteMap(guild) {
  const map = {};
  for (const channel of guild.channels.cache.values()) map[channel.id] = effectiveOverwrites(channel);
  return map;
}

// ---------------------------------------------------------------- the guild

class FakeGuild {
  constructor(gw, { id = gw.sf(), name = "Server Thử", ownerUser, memberCount = null } = {}) {
    this.gw = gw;
    this.client = gw.client;
    this.id = id;
    this.name = name;
    this.available = true;
    this.joinedTimestamp = null;
    this.verificationLevel = 0;
    this.explicitContentFilter = 0;
    this.mfaLevel = 0;
    this.rulesChannelId = null;
    this.afkChannelId = null;
    this.maximumBitrate = 96000;
    this._memberCount = memberCount;
    this.systemChannelId = null;
    this.auditLog = [];
    this.bans = new Map();
    this.automodRules = new Map();
    this.scheduled = [];
    let position = 0;

    const roles = new Collection();
    const everyone = new FakeRole(this, { id, name: "@everyone", permissions: perms(everyoneDefault), position: 0 });
    roles.set(id, everyone);
    this.roles = {
      cache: roles,
      everyone,
      create: async (o = {}) => {
        const role = this._createRole(o);
        gw.record("roleCreate", { guildId: id, roleId: role.id, name: role.name });
        return role;
      },
      fetch: async (rid) => (rid ? roles.get(rid) ?? null : roles),
    };

    const channels = new Collection();
    this.channels = {
      cache: channels,
      create: async (o) => {
        const type = o.type ?? ChannelType.GuildText;
        const name = type === ChannelType.GuildText ? String(o.name).toLowerCase().replace(/ /g, "-") : String(o.name);
        const overwrites = (o.permissionOverwrites ?? []).map((x) => ({ id: typeof x.id === "string" ? x.id : x.id.id, type: x.type ?? (roles.has(typeof x.id === "string" ? x.id : x.id.id) ? 0 : 1), allow: toBits(x.allow), deny: toBits(x.deny) }));
        const channel = new FakeChannel(this, { name, type, parentId: o.parent ?? null, topic: o.topic ?? null, overwrites, position: position++ });
        channels.set(channel.id, channel);
        gw.record("channelCreate", { guildId: id, channelId: channel.id, name, type, parentId: channel.parentId, overwrites: overwrites.map(snapshotOverwrite), reason: o.reason });
        return channel;
      },
      fetch: async (cid) => {
        if (!cid) return channels;
        const found = channels.get(cid);
        if (!found) throw apiError(10003, "Unknown Channel", 404);
        return found;
      },
    };

    const members = new Collection();
    this.members = {
      cache: members,
      me: null,
      fetch: async (uid) => {
        if (!uid) return members;
        const found = members.get(typeof uid === "string" ? uid : uid.user ?? uid.id);
        if (!found) throw apiError(10007, "Unknown Member", 404);
        return found;
      },
      ban: async (target, { deleteMessageSeconds = 0, reason } = {}) => {
        const userId = typeof target === "string" ? target : target.id;
        const me = this.members.me;
        if (!me.permissions.has(P.BanMembers)) throw apiError(50013, "Missing Permissions", 403);
        const member = members.get(userId);
        if (member && !member.bannable) throw apiError(50013, "Missing Permissions", 403);
        const user = member?.user ?? gw.users.get(userId) ?? new FakeUser(gw, { id: userId });
        members.delete(userId);
        this.bans.set(userId, { user, reason });
        gw.record("ban", { guildId: id, userId, deleteMessageSeconds, reason });
        gw.background(gw.emit(Events.GuildBanAdd, { guild: this, user, reason: reason ?? null }));
        return user;
      },
      unban: async (userId, reason) => {
        const ban = this.bans.get(userId);
        this.bans.delete(userId);
        gw.record("unban", { guildId: id, userId, reason });
        if (ban) gw.background(gw.emit(Events.GuildBanRemove, { guild: this, user: ban.user }));
      },
    };

    this.voiceStates = { cache: new Collection() };

    this.autoModerationRules = {
      fetch: async () => new Map(this.automodRules),
      create: async (o) => {
        const rule = { id: gw.sf(), enabled: true, ...o };
        this.automodRules.set(rule.id, rule);
        gw.record("automodCreate", { guildId: id, ruleId: rule.id, name: o.name });
        return rule;
      },
      edit: async (rid, o) => {
        if (!this.automodRules.has(rid)) throw apiError(10066, "Unknown Auto Moderation Rule", 404);
        this.automodRules.set(rid, { ...this.automodRules.get(rid), ...o });
        gw.record("automodEdit", { guildId: id, ruleId: rid });
      },
      delete: async (rid) => {
        if (!this.automodRules.has(rid)) throw apiError(10066, "Unknown Auto Moderation Rule", 404);
        this.automodRules.delete(rid);
        gw.record("automodDelete", { guildId: id, ruleId: rid });
      },
    };

    this.scheduledEvents = {
      create: async (o) => {
        this.scheduled.push(o);
        gw.record("scheduledEvent", { guildId: id, name: o.name });
        return { id: gw.sf(), ...o };
      },
    };

    this.owner = ownerUser ?? gw.makeUser({ username: "chu-server" });
    this.ownerId = this.owner.id;
  }

  get memberCount() {
    return this._memberCount ?? this.members.cache.size;
  }

  get systemChannel() {
    return this.systemChannelId ? this.channels.cache.get(this.systemChannelId) ?? null : null;
  }

  async setSystemChannel(channel) {
    this.systemChannelId = channel?.id ?? null;
    this.gw.record("systemChannel", { guildId: this.id, channelId: this.systemChannelId });
  }

  async setVerificationLevel(level, reason) {
    if (!this.members.me.permissions.has(P.ManageGuild)) throw apiError(50013, "Missing Permissions", 403);
    const from = this.verificationLevel;
    this.verificationLevel = level;
    this.gw.record("verification", { guildId: this.id, from, to: level, reason });
  }

  async setExplicitContentFilter(level) {
    this.explicitContentFilter = level;
  }

  async fetchAuditLogs({ type, limit = 50 } = {}) {
    const entries = new Collection();
    for (const entry of [...this.auditLog].reverse().filter((e) => type === undefined || e.action === type).slice(0, limit)) entries.set(entry.id, entry);
    return { entries };
  }

  // roles: new roles go just above @everyone and push the others up, like Discord, so the bot's own role stays on top
  _createRole(o) {
    if (o.position === undefined) for (const role of this.roles.cache.values()) if (role.position >= 1) role.position += 1;
    const role = new FakeRole(this, {
      name: o.name,
      permissions: o.permissions ?? 0n,
      position: o.position ?? 1,
      managed: Boolean(o.managed),
      color: o.colors?.primaryColor ?? o.color ?? 0,
      hoist: Boolean(o.hoist),
      mentionable: Boolean(o.mentionable),
    });
    this.roles.cache.set(role.id, role);
    return role;
  }

  _audit(action, targetId, executorId) {
    this.auditLog.push({ id: this.gw.sf(), action, targetId, executorId, createdTimestamp: this.gw.clock.now() });
  }

  _removeChannel(channel, executorId, reason) {
    if (!this.channels.cache.delete(channel.id)) throw apiError(10003, "Unknown Channel", 404);
    this._audit(AuditLogEvent.ChannelDelete, channel.id, executorId);
    this.gw.record("channelDelete", { guildId: this.id, channelId: channel.id, name: channel.name, executorId, reason });
    this.gw.background(this.gw.emit(Events.ChannelDelete, channel));
  }

  _removeRole(role, executorId, reason) {
    if (!this.roles.cache.delete(role.id)) throw apiError(10011, "Unknown Role", 404);
    for (const member of this.members.cache.values()) member.roles.cache.delete(role.id);
    this._audit(AuditLogEvent.RoleDelete, role.id, executorId);
    this.gw.record("roleDelete", { guildId: this.id, roleId: role.id, name: role.name, executorId, reason });
    this.gw.background(this.gw.emit(Events.GuildRoleDelete, role));
  }

  // Test helpers: build the world
  addRole(o) {
    return this._createRole(o);
  }

  addMember(o = {}) {
    const user = o.user ?? this.gw.makeUser({ id: o.id, username: o.name, bot: o.bot, dmOpen: o.dmOpen });
    const member = new FakeMember(this, user, o.roles ?? []);
    if (o.nickname) member.nickname = o.nickname;
    this.members.cache.set(member.id, member);
    return member;
  }

  addChannel(o) {
    const type = o.type ?? ChannelType.GuildText;
    const overwrites = (o.overwrites ?? []).map((x) => ({ id: x.id, type: x.type ?? (this.roles.cache.has(x.id) ? 0 : 1), allow: toBits(x.allow), deny: toBits(x.deny) }));
    const channel = new FakeChannel(this, { name: o.name, type, parentId: o.parentId ?? null, overwrites, position: this.channels.cache.size });
    this.channels.cache.set(channel.id, channel);
    return channel;
  }

  textChannels() {
    return [...this.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText);
  }

  channelNamed(part) {
    return [...this.channels.cache.values()].find((c) => c.name.includes(part)) ?? null;
  }

  roleNamed(part) {
    return [...this.roles.cache.values()].find((r) => r.name.includes(part)) ?? null;
  }
}

// ---------------------------------------------------------------- interactions

const OPTION = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, NUMBER: 10 };

function leafOf(json, { group, sub }) {
  let list = json.options ?? [];
  const hasSubs = list.some((o) => o.type === OPTION.SUB || o.type === OPTION.GROUP);
  if (!hasSubs) {
    if (group || sub) throw new Error(`/${json.name} has no subcommands`);
    return list;
  }
  if (group) {
    const g = list.find((o) => o.type === OPTION.GROUP && o.name === group);
    if (!g) throw new Error(`/${json.name} has no group ${group}`);
    list = g.options;
  }
  if (!sub) throw new Error(`/${json.name} needs a subcommand`);
  const s = list.find((o) => o.type === OPTION.SUB && o.name === sub);
  if (!s) throw new Error(`/${json.name} has no subcommand ${sub}`);
  return s.options ?? [];
}

function resolveOptions(gw, guild, json, { group, sub, options = {}, focused = null }) {
  const leaf = leafOf(json, { group, sub });
  const values = {};
  for (const name of Object.keys(options)) if (!leaf.some((o) => o.name === name)) throw new Error(`/${json.name}: unknown option "${name}"`);
  for (const def of leaf) {
    const given = options[def.name];
    if (given === undefined || given === null) {
      if (def.required && focused === null) throw new Error(`/${json.name}: option "${def.name}" is required`);
      continue;
    }
    const isFocus = focused === def.name;
    const fail = (why) => {
      throw new Error(`/${json.name} ${def.name}: ${why}`);
    };
    if (def.type === OPTION.STRING) {
      if (typeof given !== "string") fail("not a string");
      if (!isFocus) {
        if (def.max_length !== undefined && given.length > def.max_length) fail(`over ${def.max_length} characters`);
        if (def.min_length !== undefined && given.length < def.min_length) fail(`under ${def.min_length} characters`);
        if (def.choices && !def.choices.some((c) => c.value === given)) fail("not one of the choices");
      }
      values[def.name] = given;
    } else if (def.type === OPTION.INTEGER || def.type === OPTION.NUMBER) {
      if (typeof given !== "number" || (def.type === OPTION.INTEGER && !Number.isInteger(given))) fail("not a whole number");
      if (!isFocus) {
        if (def.min_value !== undefined && given < def.min_value) fail(`under ${def.min_value}`);
        if (def.max_value !== undefined && given > def.max_value) fail(`over ${def.max_value}`);
        if (def.choices && !def.choices.some((c) => c.value === given)) fail("not one of the choices");
      }
      values[def.name] = given;
    } else if (def.type === OPTION.BOOLEAN) {
      if (typeof given !== "boolean") fail("not a boolean");
      values[def.name] = given;
    } else if (def.type === OPTION.USER) {
      const id = typeof given === "string" ? given : given.id;
      values[def.name] = { user: guild.members.cache.get(id)?.user ?? gw.users.get(id) ?? (typeof given === "object" ? given.user ?? given : null), member: guild.members.cache.get(id) ?? null };
      if (!values[def.name].user) fail("unknown user");
    } else if (def.type === OPTION.ROLE) {
      const role = typeof given === "string" ? guild.roles.cache.get(given) : given;
      if (!role) fail("unknown role");
      values[def.name] = role;
    } else if (def.type === OPTION.CHANNEL) {
      const channel = typeof given === "string" ? guild.channels.cache.get(given) : given;
      if (!channel) fail("unknown channel");
      if (def.channel_types && !def.channel_types.includes(channel.type)) fail(`channel type ${channel.type} is not allowed`);
      values[def.name] = channel;
    } else fail(`unsupported option type ${def.type}`);
  }
  return {
    values,
    getSubcommand: (required = true) => {
      if (!sub && required) throw new Error("no subcommand");
      return sub ?? null;
    },
    getSubcommandGroup: (required = true) => {
      if (!group && required) throw new Error("no subcommand group");
      return group ?? null;
    },
    getString: (n) => values[n] ?? null,
    getInteger: (n) => values[n] ?? null,
    getNumber: (n) => values[n] ?? null,
    getBoolean: (n) => values[n] ?? null,
    getUser: (n) => values[n]?.user ?? null,
    getMember: (n) => values[n]?.member ?? null,
    getRole: (n) => values[n] ?? null,
    getChannel: (n) => values[n] ?? null,
    getFocused: (full = false) => (full ? { name: focused, value: values[focused] ?? "" } : values[focused] ?? ""),
  };
}

class FakeInteraction {
  constructor(gw, kind, { guild, member, channel, commandName = null, customId = null, values = undefined, message = null }) {
    this.gw = gw;
    this.kind = kind;
    this.client = gw.client;
    this.id = gw.sf();
    this.guild = guild;
    this.guildId = guild.id;
    this.member = member;
    this.user = member.user;
    this.channel = channel;
    this.channelId = channel.id;
    this.commandName = commandName;
    this.customId = customId;
    this.values = values;
    this.message = message;
    this.replied = false;
    this.deferred = false;
    this.surface = null;
    this.sent = [];
    this.modal = null;
    this.responses = [];
  }

  isChatInputCommand() {
    return this.kind === "command";
  }

  isAutocomplete() {
    return this.kind === "autocomplete";
  }

  isButton() {
    return this.kind === "button";
  }

  isStringSelectMenu() {
    return this.kind === "select";
  }

  isModalSubmit() {
    return this.kind === "modal";
  }

  isMessageComponent() {
    return this.kind === "button" || this.kind === "select";
  }

  isFromMessage() {
    return this.kind === "modal" ? Boolean(this.fromMessage) : this.isMessageComponent();
  }

  _guardFirst(what) {
    if (this.replied || this.deferred) throw Object.assign(new Error(`The reply to this interaction has already been sent or deferred (${what})`), { code: "InteractionAlreadyReplied" });
  }

  _guardReplied(what) {
    if (!this.replied && !this.deferred) throw Object.assign(new Error(`The reply to this interaction has not been sent or deferred (${what})`), { code: "InteractionNotReplied" });
  }

  _note(type, plain, extra = {}) {
    const entry = { type, payload: plain, ephemeral: Boolean(this.ephemeral), ...extra };
    this.sent.push(entry);
    this.gw.record(type, { interactionId: this.id, command: this.commandName ?? this.customId, userId: this.user.id, channelId: this.channel.id, guildId: this.guildId, ephemeral: Boolean(this.ephemeral), payload: plain, ...extra });
  }

  _newSurface(plain, ephemeral) {
    const message = new BotMessage(this.gw, { channel: this.channel, author: this.gw.client.user, payload: plain, ephemeralFor: ephemeral ? this.user.id : null, interactionId: this.id });
    if (!ephemeral) this.channel.messages.cache.set(message.id, message);
    this.gw.messages.push(message);
    return message;
  }

  async reply(input) {
    this._guardFirst("reply");
    if (this.kind === "autocomplete") throw new Error("An autocomplete interaction cannot be replied to");
    const plain = plainPayload(input, { label: "reply" });
    this.ephemeral = Boolean((plain.flags ?? 0) & MessageFlags.Ephemeral);
    this.replied = true;
    this.surface = this._newSurface(plain, this.ephemeral);
    this._note("reply", plain);
    return input?.fetchReply ? this.surface : {};
  }

  async deferReply(options = {}) {
    this._guardFirst("deferReply");
    this.ephemeral = Boolean((options.flags ?? 0) & MessageFlags.Ephemeral);
    this.deferred = true;
    this.surface = this._newSurface({ content: "", embeds: [], components: [] }, this.ephemeral);
    this._note("defer", {}, {});
    return {};
  }

  async deferUpdate() {
    this._guardFirst("deferUpdate");
    if (!this.isMessageComponent()) throw new Error("deferUpdate is only for components");
    this.deferred = true;
    this.surface = this.message;
    this._note("deferUpdate", {});
    return {};
  }

  async editReply(input) {
    this._guardReplied("editReply");
    const plain = plainPayload(input, { allowEmpty: true, label: "editReply" });
    this.replied = true;
    this.surface?._merge(plain);
    this._note("editReply", plain);
    return this.surface;
  }

  async followUp(input) {
    this._guardReplied("followUp");
    const plain = plainPayload(input, { label: "followUp" });
    const ephemeral = Boolean((plain.flags ?? 0) & MessageFlags.Ephemeral);
    this._newSurface(plain, ephemeral);
    this._note("followUp", plain, { ephemeral });
    return {};
  }

  async update(input) {
    this._guardFirst("update");
    if (!this.isMessageComponent() && !(this.kind === "modal" && this.fromMessage)) throw new Error("update is only for components");
    const plain = plainPayload(input, { allowEmpty: true, label: "update" });
    this.replied = true;
    this.surface = this.message;
    this.ephemeral = Boolean(this.message?.ephemeralFor);
    this.message?._merge(plain);
    this._note("update", plain);
    return {};
  }

  async showModal(modal) {
    this._guardFirst("showModal");
    if (this.kind === "modal") throw new Error("A modal cannot be answered with a modal");
    const json = jsonOf(modal);
    if (!json.custom_id || !json.title || json.title.length > 45) throw apiError(50035, "Invalid modal");
    const inputs = (json.components ?? []).flatMap((row) => row.components ?? []);
    if (!inputs.length || inputs.length > 5) throw apiError(50035, "A modal needs 1 to 5 inputs");
    this.replied = true;
    this.modal = json;
    this.gw.modals.push({ json, fromMessage: this.isMessageComponent(), userId: this.user.id, message: this.message });
    this._note("modal", {}, { modal: json });
    return {};
  }

  async respond(choices) {
    if (this.kind !== "autocomplete") throw new Error("respond is only for autocomplete");
    if (this.replied) throw new Error("Already responded");
    if (choices.length > 25) throw apiError(50035, "More than 25 autocomplete choices");
    for (const c of choices) if (!c.name || c.name.length > 100 || (typeof c.value === "string" && c.value.length > 100)) throw apiError(50035, "Bad autocomplete choice");
    this.replied = true;
    this.choices = choices;
    this.gw.record("respond", { interactionId: this.id, command: this.commandName, choices });
    return {};
  }

  // Everything this interaction said, joined, and the last payload
  get text() {
    return this.sent.map((s) => textOf(s.payload)).filter(Boolean).join("\n");
  }

  get last() {
    return this.sent.at(-1)?.payload ?? null;
  }

  get replies() {
    return this.sent.filter((s) => s.type === "reply" || s.type === "followUp" || s.type === "editReply");
  }

  // The surface this interaction ended with (its reply, or the message it updated)
  get finalPayload() {
    return this.surface?.payload ?? this.last;
  }
}

// ---------------------------------------------------------------- the gateway

class FakeClient extends EventEmitter {
  constructor(gw, botId) {
    super();
    this.gw = gw;
    this.user = Object.assign(new FakeUser(gw, { id: botId, username: "Thầu Xây Dựng", bot: true }), { setActivity() {} });
    this.guilds = { cache: new Collection() };
    this.commands = new Collection();
    this.channels = {
      fetch: async (id) => {
        for (const guild of this.guilds.cache.values()) if (guild.channels.cache.has(id)) return guild.channels.cache.get(id);
        throw apiError(10003, "Unknown Channel", 404);
      },
    };
    this.setMaxListeners(100);
  }

  // Handlers are async. Like discord.js nothing waits for them here, but the gateway keeps their promises so a test can.
  _wrap(fn) {
    return (...args) => {
      const result = fn(...args);
      const promise = Promise.resolve(result);
      this.gw.capture.at(-1)?.push(promise);
      this.gw.background(promise);
      return result;
    };
  }

  on(name, fn) {
    return super.on(name, this._wrap(fn));
  }

  once(name, fn) {
    return super.once(name, this._wrap(fn));
  }
}

export async function createGateway({ env = {}, start = BASE_TIME } = {}) {
  const clock = makeClock(start);
  Date.now = () => clock.now();

  const botId = "1100000000000000001";
  process.env.DISCORD_TOKEN = "e2e-token";
  process.env.CLIENT_ID = botId;
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "e2e-"));
  process.env.BUILD_STEP_DELAY_MS = "0";
  for (const [key, value] of Object.entries(env)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }

  const gw = {
    clock,
    records: [],
    messages: [],
    modals: [],
    pending: new Set(),
    errors: [],
    capture: [],
    contentReads: 0,
    consoleErrors: [],
    users: new Map(),
    jobs: new Map(),
    botId,
    P,
  };

  let seq = 0n;
  gw.sf = () => String((((BigInt(clock.now()) - DISCORD_EPOCH) << 22n) | (seq++ & 0x3fffffn)) + 0n);
  gw.record = (kind, data) => {
    gw.records.push({ seq: gw.records.length, at: clock.now(), kind, ...data });
  };
  gw.background = (promise) => {
    const tracked = promise.then(
      () => {},
      (error) => {
        gw.errors.push(error);
      },
    ).finally(() => gw.pending.delete(tracked));
    gw.pending.add(tracked);
  };
  gw.makeUser = (o = {}) => {
    const user = new FakeUser(gw, o);
    gw.users.set(user.id, user);
    return user;
  };

  // What the bot logs on purpose (failed Discord calls it handles) is collected, not printed
  const realConsoleError = console.error;
  console.error = (...args) => gw.consoleErrors.push(args.map(String).join(" "));

  const client = new FakeClient(gw, botId);
  gw.client = client;
  gw.users.set(botId, client.user);

  // ---- load commands and events exactly the way src/index.js does
  const commandsDir = path.join(srcDir, "commands");
  for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
    const { default: command } = await import(pathToFileURL(path.join(commandsDir, file)).href);
    client.commands.set(command.data.name, command);
  }
  gw.events = [];
  const eventsDir = path.join(srcDir, "events");
  for (const file of readdirSync(eventsDir).filter((f) => f.endsWith(".js"))) {
    const { default: event } = await import(pathToFileURL(path.join(eventsDir, file)).href);
    const register = event.once ? client.once.bind(client) : client.on.bind(client);
    register(event.name, (...args) => event.execute(client, ...args));
    gw.events.push({ file, name: event.name, once: Boolean(event.once) });
  }

  // ---- jobs, loaded the way src/jobs.js does, but run on demand against the injectable clock
  const jobsDir = path.join(srcDir, "jobs");
  for (const file of readdirSync(jobsDir).filter((f) => f.endsWith(".js"))) {
    const { default: job } = await import(pathToFileURL(path.join(jobsDir, file)).href);
    gw.jobs.set(job.name, { job, file, last: clock.now() });
  }

  // ---- events

  // Delivers an event to the real event modules and waits for every handler. A handler that throws fails the test.
  gw.emit = async (name, ...args) => {
    const batch = [];
    gw.capture.push(batch);
    try {
      client.emit(name, ...args);
    } finally {
      gw.capture.pop();
    }
    const settled = await Promise.allSettled(batch);
    const failed = settled.find((r) => r.status === "rejected");
    if (failed) {
      const at = gw.errors.indexOf(failed.reason);
      if (at >= 0) gw.errors.splice(at, 1);
      throw failed.reason;
    }
  };

  // Waits for work started in the background (events a fake Discord call raised, such as a ban or a deletion)
  gw.settle = async () => {
    while (gw.pending.size) await Promise.allSettled([...gw.pending]);
    if (gw.errors.length) throw gw.errors.shift();
  };

  // ---- the world

  gw.createGuild = ({ name = "Server Thử", systemChannel = true, memberCount = null, botPermissions = ["Administrator"], channels = true, attach = true } = {}) => {
    const guild = new FakeGuild(gw, { name, memberCount });
    guild.addMember({ user: guild.owner });
    const botRole = guild.addRole({ name: "Thầu Xây Dựng", permissions: perms(botPermissions).bitfield, position: 1000, managed: true });
    guild.botRole = botRole;
    guild.members.me = guild.addMember({ user: client.user, roles: [botRole] });
    if (channels) {
      const text = guild.addChannel({ name: "general", type: ChannelType.GuildText });
      guild.addChannel({ name: "General", type: ChannelType.GuildVoice });
      if (systemChannel) guild.systemChannelId = text.id;
    }
    if (attach) {
      guild.joinedTimestamp = clock.now() - 30 * 86400000;
      client.guilds.cache.set(guild.id, guild);
    }
    return guild;
  };

  gw.addAdmin = (guild, name = "admin") => {
    const role = guild.roleNamed("Quản trị") ?? guild.addRole({ name: "Quản trị viên", permissions: perms(["Administrator"]).bitfield, position: 500 });
    return guild.addMember({ name, roles: [role] });
  };

  gw.addMod = (guild, name = "mod", flags = ["ModerateMembers", "ManageMessages", "ManageGuild", "KickMembers", "BanMembers"]) => {
    const role = guild.addRole({ name: `Mod ${name}`, permissions: perms(flags).bitfield, position: 400 });
    return guild.addMember({ name, roles: [role] });
  };

  gw.addPerson = (guild, name = "member", roles = []) => guild.addMember({ name, roles });

  // The bot joins the server: GuildCreate reaches the real handler
  gw.botJoins = async (guild) => {
    guild.joinedTimestamp = clock.now();
    client.guilds.cache.set(guild.id, guild);
    await gw.emit(Events.GuildCreate, guild);
  };

  gw.botLeaves = async (guild) => {
    client.guilds.cache.delete(guild.id);
    await gw.emit(Events.GuildDelete, guild);
  };

  // ---- messages

  const memberOf = (guild, who) => (who instanceof FakeMember ? who : guild.members.cache.get(typeof who === "string" ? who : who.id));

  gw.message = (guild, channel, who, { type = MessageType.Default, id } = {}) => {
    const member = memberOf(guild, who);
    const author = member?.user ?? who;
    return new IncomingMessage(gw, { channel, author, member, type, id });
  };

  gw.say = async (member, channel) => {
    const message = gw.message(member.guild, channel, member);
    await gw.emit(Events.MessageCreate, message);
    return message;
  };

  // A person joins: they appear in the member list and Discord posts its "member joined" notice in the system channel
  gw.join = async (guild, { name, bot = false, roles = [], channel = guild.systemChannel, id } = {}) => {
    const member = guild.addMember({ name, bot, roles, id });
    const message = gw.message(guild, channel, member, { type: MessageType.UserJoin });
    await gw.emit(Events.MessageCreate, message);
    return { member, message };
  };

  gw.voice = async (member, channel, { selfDeaf = false } = {}) => {
    const guild = member.guild;
    const old = guild.voiceStates.cache.get(member.id) ?? { id: member.id, guild, member, channelId: null, selfDeaf: false, serverDeaf: false };
    const next = { id: member.id, guild, member, channelId: channel?.id ?? null, channel: channel ?? null, selfDeaf, serverDeaf: false };
    if (channel) guild.voiceStates.cache.set(member.id, next);
    else guild.voiceStates.cache.delete(member.id);
    await gw.emit(Events.VoiceStateUpdate, old, next);
    return next;
  };

  const executorId = (by) => (by === undefined || by === null ? botId : typeof by === "string" ? by : by.id);

  gw.deleteChannel = async (channel, { by } = {}) => {
    channel.guild._removeChannel(channel, executorId(by), "deleted by hand");
    await gw.settle();
  };

  gw.deleteRole = async (role, { by } = {}) => {
    role.guild._removeRole(role, executorId(by), "deleted by hand");
    await gw.settle();
  };

  // ---- interactions

  const defaultChannel = (guild) => guild.systemChannel ?? guild.textChannels()[0];

  const dispatch = async (interaction, { allowCrash = false } = {}) => {
    await gw.emit(Events.InteractionCreate, interaction);
    await gw.settle();
    const crashed = interaction.sent.some((s) => String(textOf(s.payload)).includes(CRASH_TEXT));
    if (crashed && !allowCrash) throw new Error(`The router hit its error path for ${interaction.commandName ?? interaction.customId}: ${gw.consoleErrors.slice(-3).join(" | ")}`);
    return interaction;
  };
  gw.dispatch = dispatch;

  // /name sub options, as the person would run it. Discord hides a command from people who lack its default permission, so
  // that is checked here too unless `hidden: true` says the command was opened up to them by the server.
  gw.slash = async (name, { guild, member, channel, sub, group, options = {}, hidden = false, allowCrash = false } = {}) => {
    const command = client.commands.get(name);
    if (!command) throw new Error(`No command /${name}`);
    const json = command.data.toJSON();
    if (!hidden && json.default_member_permissions) {
      const need = BigInt(json.default_member_permissions);
      if (!member.permissions.has(need)) throw new Error(`Discord would hide /${name} from ${member.displayName}; pass hidden: true to call it anyway`);
    }
    const interaction = new FakeInteraction(gw, "command", { guild, member, channel: channel ?? defaultChannel(guild), commandName: name });
    interaction.options = resolveOptions(gw, guild, json, { group, sub, options });
    return dispatch(interaction, { allowCrash });
  };

  gw.autocomplete = async (name, { guild, member, channel, sub, group, focused, options = {} } = {}) => {
    const command = client.commands.get(name);
    const json = command.data.toJSON();
    const interaction = new FakeInteraction(gw, "autocomplete", { guild, member, channel: channel ?? defaultChannel(guild), commandName: name });
    interaction.options = resolveOptions(gw, guild, json, { group, sub, options, focused: focused.name });
    interaction.options.values[focused.name] = focused.value ?? "";
    return dispatch(interaction);
  };

  // The newest message-like thing carrying a component with this custom id (a channel message or an ephemeral reply)
  gw.findComponent = (customId, { channel } = {}) => {
    for (const message of [...gw.messages].reverse()) {
      if (message.deleted) continue;
      if (channel && message.channelId !== channel.id) continue;
      const component = componentsOf(message.payload).find((c) => c.custom_id === customId);
      if (component) return { message, component };
    }
    return null;
  };

  gw.click = async (customId, { member, channel, message, allowCrash = false } = {}) => {
    const found = message ? { message, component: componentsOf(message.payload).find((c) => c.custom_id === customId) } : gw.findComponent(customId, { channel });
    if (!found?.component) throw new Error(`No button "${customId}" has been posted${channel ? ` in #${channel.name}` : ""}`);
    if (found.component.type !== 2) throw new Error(`"${customId}" is not a button`);
    if (found.component.disabled) throw new Error(`The button "${customId}" is disabled`);
    const guild = member.guild;
    const interaction = new FakeInteraction(gw, "button", { guild, member, channel: found.message.channel ?? channel ?? defaultChannel(guild), customId, message: found.message });
    return dispatch(interaction, { allowCrash });
  };

  gw.select = async (customId, values, { member, channel, allowCrash = false } = {}) => {
    const found = gw.findComponent(customId, { channel });
    if (!found) throw new Error(`No menu "${customId}" has been posted`);
    const menu = found.component;
    if (menu.type !== 3) throw new Error(`"${customId}" is not a menu`);
    if (menu.disabled) throw new Error(`The menu "${customId}" is disabled`);
    if (values.length < (menu.min_values ?? 1) || values.length > (menu.max_values ?? 1)) throw new Error(`Menu "${customId}" takes ${menu.min_values ?? 1} to ${menu.max_values ?? 1} values`);
    for (const v of values) if (!menu.options.some((o) => o.value === v)) throw new Error(`Menu "${customId}" has no option "${v}"`);
    const guild = member.guild;
    const interaction = new FakeInteraction(gw, "select", { guild, member, channel: found.message.channel ?? channel ?? defaultChannel(guild), customId, values, message: found.message });
    return dispatch(interaction, { allowCrash });
  };

  // Fills in the modal the bot last showed this person
  gw.submitModal = async (customId, fields, { member, channel, allowCrash = false } = {}) => {
    const shown = [...gw.modals].reverse().find((m) => m.json.custom_id === customId && m.userId === member.id);
    if (!shown) throw new Error(`The bot has not shown modal "${customId}" to ${member.displayName}`);
    const inputs = shown.json.components.flatMap((row) => row.components);
    for (const key of Object.keys(fields)) if (!inputs.some((i) => i.custom_id === key)) throw new Error(`Modal "${customId}" has no input "${key}"`);
    for (const input of inputs) {
      const value = fields[input.custom_id] ?? "";
      if (input.required !== false && !value) throw new Error(`Modal input "${input.custom_id}" is required`);
      if (input.max_length !== undefined && value.length > input.max_length) throw new Error(`Modal input "${input.custom_id}" is over ${input.max_length}`);
    }
    const guild = member.guild;
    const interaction = new FakeInteraction(gw, "modal", { guild, member, channel: channel ?? defaultChannel(guild), customId });
    interaction.fromMessage = shown.fromMessage;
    interaction.message = shown.fromMessage ? shown.message : null;
    interaction.fields = {
      getTextInputValue: (id) => {
        if (!inputs.some((i) => i.custom_id === id)) throw new Error(`No modal input ${id}`);
        return fields[id] ?? "";
      },
    };
    return dispatch(interaction, { allowCrash });
  };

  // ---- jobs

  gw.runJob = async (name) => {
    const entry = gw.jobs.get(name);
    if (!entry) throw new Error(`No job ${name}`);
    entry.last = clock.now();
    const result = await entry.job.run(client);
    await gw.settle();
    return result;
  };

  // Moves the clock forward and runs every job whose interval has passed, like the timers of src/jobs.js would
  gw.advance = async (ms, { jobs = false } = {}) => {
    clock.advance(ms);
    const ran = [];
    if (!jobs) return ran;
    const names = jobs === true ? [...gw.jobs.keys()] : jobs;
    for (const name of names) {
      const entry = gw.jobs.get(name);
      if (!entry) throw new Error(`No job ${name}`);
      if (clock.now() - entry.last >= entry.job.everyMs) {
        await gw.runJob(name);
        ran.push(name);
      }
    }
    return ran;
  };

  // ---- reading the records

  gw.find = (kind, predicate = () => true) => gw.records.filter((r) => r.kind === kind && predicate(r));
  gw.sentTo = (channel, predicate = () => true) => gw.find("send", (r) => r.channelId === channel.id && predicate(r));
  gw.mark = () => gw.records.length;
  gw.since = (mark) => gw.records.slice(mark);
  gw.textOfSent = (channel) => gw.sentTo(channel).map((r) => textOf(r.payload)).join("\n");

  // ---- fetch stub for the payment gateways
  const realFetch = globalThis.fetch;
  gw.stubFetch = (handler) => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const result = await handler(String(url), init);
      return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: async () => result.body };
    };
    return calls;
  };

  gw.close = () => {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
    Date.now = realNow;
  };

  return gw;
}

export { FakeGuild, FakeMember, FakeChannel, FakeRole, FakeUser, ChannelType, MessageFlags, MessageType, perms };
