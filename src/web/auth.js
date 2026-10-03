import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isSnowflake } from "./validate.js";

// Sessions, signed cookies and the Discord OAuth2 code flow. Sessions live in memory: a restart logs everyone out, which is fine for an admin tool.

const ADMINISTRATOR = 0x8n;
const DAY = 24 * 60 * 60 * 1000;

export const SESSION_TTL_MS = 7 * DAY;
export const STATE_TTL_S = 600;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Compares through a hash so lengths never leak and the comparison time does not depend on where the strings differ
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function parseCookies(header) {
  const jar = {};
  if (typeof header !== "string") return jar;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!(name in jar)) jar[name] = part.slice(at + 1).trim();
  }
  return jar;
}

const HASH = /^[a-zA-Z0-9_]{1,64}$/;
const cdn = (kind, id, hash, size, ext = "png") => (isSnowflake(id) && typeof hash === "string" && HASH.test(hash) ? `https://cdn.discordapp.com/${kind}/${id}/${hash}.${ext}?size=${size}` : null);
export const avatarUrl = (id, hash) => cdn("avatars", id, hash, 64);
export const iconUrl = (id, hash) => cdn("icons", id, hash, 128);

export function createAuth({ secret, publicUrl, clientId, clientSecret, fetchFn, now, random, apiBase, maxSessions = 2000 }) {
  const secure = publicUrl.startsWith("https");
  const redirectUri = `${publicUrl}/auth/callback`;
  const sessions = new Map();
  // The __Host- prefix makes browsers refuse a cookie set from a sibling subdomain or without Secure
  const prefix = secure ? "__Host-" : "";
  const names = { session: `${prefix}thau_sid`, state: `${prefix}thau_state` };

  const sign = (value) => createHmac("sha256", secret).update(`sig:${value}`).digest("base64url");
  const pack = (value) => `${value}.${sign(value)}`;
  function unpack(token) {
    if (typeof token !== "string") return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const value = token.slice(0, dot);
    return safeEqual(token.slice(dot + 1), sign(value)) ? value : null;
  }

  const cookie = (name, value, maxAgeSeconds) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;

  const csrfFor = (sessionId) => createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("hex");

  function purgeExpired() {
    const t = now();
    for (const [id, s] of sessions) if (s.expiresAt <= t) sessions.delete(id);
  }

  function createSession({ userId, name, avatar, guildIds }) {
    purgeExpired();
    // At the cap the oldest session goes, so a flood of logins cannot grow memory without bound
    while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
    const id = random(24).toString("base64url");
    sessions.set(id, { id, userId, name, avatar, guildIds: new Set(guildIds), expiresAt: now() + SESSION_TTL_MS });
    return id;
  }

  function sessionFrom(cookies) {
    const id = unpack(cookies[names.session]);
    const session = id ? sessions.get(id) : null;
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }
    return session;
  }

  const destroy = (id) => sessions.delete(id);

  // ----- OAuth -----
  function startLogin() {
    const state = random(24).toString("base64url");
    const url = new URL(`${apiBase.replace(/\/api\/v\d+$/, "")}/oauth2/authorize`);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify guilds", state }).toString();
    return { location: url.toString(), setCookie: cookie(names.state, pack(state), STATE_TTL_S) };
  }

  const verifyState = (cookies, queryState) => {
    const expected = unpack(cookies[names.state]);
    return Boolean(expected) && safeEqual(expected, queryState);
  };

  const clearCookie = (name) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

  async function discord(path, init = {}) {
    const response = await fetchFn(`${apiBase}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Discord answered ${response.status} for ${path}`);
    return response.json();
  }

  // Trades the code for the user and their guilds, and revokes the token before returning: it is never needed again
  async function exchange(code) {
    const form = (data) => ({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(),
    });
    const token = await discord("/oauth2/token", form({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }));
    const access = token?.access_token;
    if (typeof access !== "string" || !access) throw new Error("No access token in the answer");
    try {
      const headers = { Authorization: `Bearer ${access}` };
      const [user, guilds] = await Promise.all([discord("/users/@me", { headers }), discord("/users/@me/guilds", { headers })]);
      return { user, guilds };
    } finally {
      try {
        await discord("/oauth2/token/revoke", form({ client_id: clientId, client_secret: clientSecret, token: access, token_type_hint: "access_token" }));
      } catch (error) {
        console.error("Dashboard: could not revoke a token:", error.message);
      }
    }
  }

  // The guilds where this person can manage the server
  function managedGuildIds(guilds) {
    const out = [];
    for (const g of Array.isArray(guilds) ? guilds : []) {
      if (!g || !isSnowflake(g.id)) continue;
      let bits = 0n;
      try {
        bits = BigInt(g.permissions ?? 0);
      } catch {
        continue;
      }
      if (g.owner === true || (bits & ADMINISTRATOR) !== 0n) out.push(g.id);
    }
    return out;
  }

  return {
    names,
    secure,
    csrfFor,
    createSession,
    sessionFrom,
    destroy,
    startLogin,
    verifyState,
    exchange,
    managedGuildIds,
    sessionCookie: (id) => cookie(names.session, pack(id), SESSION_TTL_MS / 1000),
    clearSessionCookie: () => clearCookie(names.session),
    clearStateCookie: () => clearCookie(names.state),
    size: () => sessions.size,
    purgeExpired,
  };
}
