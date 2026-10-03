// Voice time without any message content. The tracker keeps its own small model of who is in which voice channel and, for each person,
// how long they were "active": not deafened, not in the AFK channel, and with at least one other listening human in the room.
// It returns whole minutes when a person leaves or switches channel. Pure: no Discord objects are kept, and the clock is injectable.

const MINUTE = 60_000;

export function createVoiceTracker({ now = Date.now } = {}) {
  const sessions = new Map(); // `${guildId}:${userId}` -> session
  const seeded = new Set(); // guilds whose current voice state has been read once

  const keyOf = (guildId, userId) => `${guildId}:${userId}`;

  const inChannel = (guildId, channelId) => [...sessions.values()].filter((s) => s.guildId === guildId && s.channelId === channelId);

  // Recompute who is active in a channel and bank the time of anyone whose status flips
  function refresh(guildId, channelId, at) {
    const room = inChannel(guildId, channelId);
    for (const s of room) {
      const listeners = room.filter((o) => o !== s && !o.deaf).length;
      const active = !s.deaf && !s.afk && listeners >= 1;
      if (active && s.activeSince === null) s.activeSince = at;
      else if (!active && s.activeSince !== null) {
        s.accMs += Math.max(0, at - s.activeSince);
        s.activeSince = null;
      }
    }
  }

  function settle(session, at) {
    const live = session.activeSince === null ? 0 : Math.max(0, at - session.activeSince);
    return Math.floor((session.accMs + live) / MINUTE);
  }

  const fresh = (guildId, userId, channelId, flags) => ({
    guildId,
    userId,
    channelId,
    deaf: Boolean(flags.deaf),
    afk: Boolean(flags.afk),
    accMs: 0,
    activeSince: null,
  });

  return {
    isSeeded: (guildId) => seeded.has(guildId),

    // members: [{ userId, channelId, deaf, afk, bot }] for everyone in voice right now. Starts the clock at this moment.
    seed(guildId, members) {
      const at = now();
      seeded.add(guildId);
      const channels = new Set();
      for (const m of members) {
        if (m.bot || !m.channelId) continue;
        sessions.set(keyOf(guildId, m.userId), fresh(guildId, m.userId, m.channelId, m));
        channels.add(m.channelId);
      }
      for (const channelId of channels) refresh(guildId, channelId, at);
    },

    // One voice state change of a human. Returns [{ guildId, userId, minutes }] to credit, normally zero or one entry.
    update(guildId, userId, { channelId, deaf = false, afk = false }) {
      const at = now();
      const key = keyOf(guildId, userId);
      const credits = [];
      const session = sessions.get(key);

      if (session && session.channelId !== channelId) {
        const minutes = settle(session, at);
        sessions.delete(key);
        refresh(guildId, session.channelId, at);
        if (minutes > 0) credits.push({ guildId, userId, minutes });
      }
      if (channelId) {
        const current = sessions.get(key);
        if (!current) sessions.set(key, fresh(guildId, userId, channelId, { deaf, afk }));
        else {
          current.deaf = Boolean(deaf);
          current.afk = Boolean(afk);
        }
        refresh(guildId, channelId, at);
      }
      return credits;
    },

    // Drops everything known about a guild (the bot left it)
    forgetGuild(guildId) {
      seeded.delete(guildId);
      for (const [key, s] of sessions) if (s.guildId === guildId) sessions.delete(key);
    },

    size: () => sessions.size,
  };
}
