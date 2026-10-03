import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import * as api from "./api.js";
import { HttpError, createAuth, parseCookies, safeEqual } from "./auth.js";
import { isSnowflake } from "./validate.js";

// The settings dashboard. It runs inside the bot process and is only reachable through the proxy in front of it, so it binds to loopback.
// Nothing here trusts the browser: every guild route re-checks the session AND asks Discord whether the person is still an admin.

export const MAX_BODY = 20 * 1024;
const DISCORD_API = "https://discord.com/api/v10";
const STATIC_ROOT = path.resolve(import.meta.dirname, "../../dashboard");

const CSP = "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const MESSAGES = {
  unauthenticated: "Bạn chưa đăng nhập, hoặc phiên đã hết hạn. Đăng nhập lại bằng Discord nhé.",
  forbidden: "Bạn không có quyền quản lý server này, hoặc quyền của bạn vừa bị gỡ.",
  csrf: "Yêu cầu bị từ chối vì thiếu dấu xác thực. Tải lại trang rồi thử lại.",
  tooMany: "Từ từ thôi đại ca, gửi nhiều quá thầu xử lý không kịp. Thử lại sau ít phút.",
  notFound: "Không tìm thấy trang này.",
  method: "Cách gọi này không được hỗ trợ.",
  tooLarge: "Dữ liệu gửi lên quá lớn (tối đa 20 KB).",
  badJson: "Dữ liệu gửi lên không phải JSON hợp lệ.",
  busy: "Thầu đang xử lý một thay đổi khác của server này. Đợi chút rồi thử lại.",
  internal: "Thầu vấp một cái, không phải lỗi của bạn. Thử lại sau chút nhé.",
};

// Fixed-window counters. `now` is injected so tests do not have to wait a real minute.
function createLimiter(now) {
  const buckets = new Map();
  return {
    hit(key, max, windowMs = 60_000) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || t - bucket.start >= windowMs) {
        bucket = { start: t, count: 0, windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return bucket.count > max ? Math.max(1, Math.ceil((bucket.start + windowMs - t) / 1000)) : 0;
    },
    prune() {
      const t = now();
      for (const [key, b] of buckets) if (t - b.start >= b.windowMs) buckets.delete(key);
    },
  };
}

const ROUTES = [
  { method: "GET", re: /^\/auth\/login$/, name: "login", public: true },
  { method: "GET", re: /^\/auth\/callback$/, name: "callback", public: true },
  { method: "GET", re: /^\/auth\/logout$/, name: "logout", public: true },
  { method: "GET", re: /^\/api\/me$/, name: "me" },
  { method: "GET", re: /^\/api\/guilds\/([^/]+)$/, name: "guild", guild: true },
  { method: "PUT", re: /^\/api\/guilds\/([^/]+)\/settings\/([^/]+)$/, name: "settings", guild: true, body: true },
  { method: "POST", re: /^\/api\/guilds\/([^/]+)\/audit$/, name: "audit", guild: true, body: true },
  { method: "POST", re: /^\/api\/guilds\/([^/]+)\/audit\/fix$/, name: "fix", guild: true, body: true },
  { method: "POST", re: /^\/api\/guilds\/([^/]+)\/tickets\/panel$/, name: "panel", guild: true, body: true },
  { method: "GET", re: /^\/api\/guilds\/([^/]+)\/orders$/, name: "orders", guild: true },
];

const page = (message) =>
  `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thầu xây dựng</title><body><p>${message.replace(/[<>&]/g, "")}</p><p><a href="/">Về trang chủ</a></p></body></html>`;

export function createDashboard(client, options = {}) {
  const dash = { ...config.dashboard, ...options };
  const publicUrl = String(dash.publicUrl).replace(/\/+$/, "");
  const origin = new URL(publicUrl).origin;
  const now = options.now ?? Date.now;
  const random = options.random ?? randomBytes;
  const staticRoot = options.staticRoot ? path.resolve(options.staticRoot) : STATIC_ROOT;
  const limits = { anonymous: 20, session: 120, assets: 600, ...(options.limits ?? {}) };

  const auth = createAuth({
    secret: dash.sessionSecret,
    publicUrl,
    clientId: options.clientId ?? config.clientId,
    clientSecret: dash.clientSecret,
    fetchFn: options.fetch ?? globalThis.fetch,
    now,
    random,
    apiBase: options.discordApi ?? DISCORD_API,
    maxSessions: options.maxSessions,
  });
  const limiter = createLimiter(now);
  const ctx = { client, auth, now, auditRuns: new Map() };
  const busy = new Set();

  // Behind the proxy the socket peer is always loopback, so the address that matters is the one the proxy appended last
  function clientIp(req) {
    const peer = req.socket.remoteAddress ?? "unknown";
    if (peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1") {
      const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (forwarded.length) return forwarded.at(-1).slice(0, 64);
    }
    return peer;
  }

  function send(res, status, body, headers = {}) {
    const data = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    res.writeHead(status, {
      "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Length": data.length,
      ...headers,
    });
    res.end(res.req?.method === "HEAD" ? undefined : data);
  }

  const fail = (res, status, message, headers = {}) => send(res, status, { error: message }, headers);

  function securityHeaders(res) {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
  }

  async function readJson(req, res) {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      res.setHeader("Connection", "close");
      throw new HttpError(413, MESSAGES.tooLarge);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.setHeader("Connection", "close");
        throw new HttpError(413, MESSAGES.tooLarge);
      }
      chunks.push(chunk);
    }
    if (!size) return {};
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError(400, MESSAGES.badJson);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, MESSAGES.badJson);
    return parsed;
  }

  // Cookie plus header plus Origin plus content type: a cross-site page can forge none of the first three and cannot send JSON without a preflight
  function checkCsrf(req, session) {
    if (!safeEqual(String(req.headers["x-csrf-token"] ?? ""), auth.csrfFor(session.id))) throw new HttpError(403, MESSAGES.csrf);
    if (req.headers.origin !== origin) throw new HttpError(403, MESSAGES.csrf);
    const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") throw new HttpError(403, MESSAGES.csrf);
  }

  // The guild must be in the session, still hold the bot, and the person must STILL be an admin there according to Discord right now
  async function authorizeGuild(session, id) {
    if (!isSnowflake(id)) throw new HttpError(400, "Mã server không hợp lệ.");
    const guild = client.guilds.cache.get(id);
    if (!session.guildIds.has(id) || !guild) throw new HttpError(403, MESSAGES.forbidden);
    let member;
    try {
      member = await guild.members.fetch({ user: session.userId, force: true });
    } catch {
      throw new HttpError(403, MESSAGES.forbidden);
    }
    const p = member?.permissions;
    if (!p || !p.has(PermissionFlagsBits.Administrator)) {
      throw new HttpError(403, MESSAGES.forbidden);
    }
    return guild;
  }

  async function authRoute(name, req, res, url, session, cookies) {
    if (name === "login") {
      const { location, setCookie } = auth.startLogin();
      return send(res, 302, "", { Location: location, "Set-Cookie": setCookie });
    }
    if (name === "logout") {
      if (session) auth.destroy(session.id);
      return send(res, 302, "", { Location: "/", "Set-Cookie": auth.clearSessionCookie() });
    }
    // callback
    const done = (status, message) => send(res, status, page(message), { "Set-Cookie": auth.clearStateCookie() });
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error")) return done(400, "Bạn đã từ chối đăng nhập, không sao, khi nào muốn thì quay lại.");
    if (!state || !auth.verifyState(cookies, state)) return done(400, "Phiên đăng nhập không khớp hoặc đã quá hạn. Bấm đăng nhập lại từ đầu nhé.");
    if (typeof code !== "string" || !code || code.length > 512) return done(400, "Discord không gửi mã đăng nhập. Thử lại nhé.");
    let result;
    try {
      result = await auth.exchange(code);
    } catch (error) {
      console.error("Dashboard login failed:", error.message);
      return done(502, "Discord không cho thầu xác nhận bạn lúc này. Thử lại sau chút.");
    }
    const userId = result.user?.id;
    if (!isSnowflake(userId)) return done(502, "Discord trả về dữ liệu lạ. Thử lại sau chút.");
    // Only servers the person can manage AND where the bot already is
    const guildIds = auth.managedGuildIds(result.guilds).filter((id) => client.guilds.cache.has(id));
    if (session) auth.destroy(session.id);
    const sid = auth.createSession({
      userId,
      name: String(result.user.global_name ?? result.user.username ?? "").slice(0, 64),
      avatar: typeof result.user.avatar === "string" ? result.user.avatar : null,
      guildIds,
    });
    res.setHeader("Set-Cookie", [auth.clearStateCookie(), auth.sessionCookie(sid)]);
    return send(res, 302, "", { Location: "/" });
  }

  async function apiRoute(route, match, req, res, session) {
    if (route.name === "me") return send(res, 200, api.me(session, client, ctx));
    const guildId = match[1];
    if (route.method !== "GET") checkCsrf(req, session);
    const guild = await authorizeGuild(session, guildId);
    const body = route.body ? await readJson(req, res) : null;

    if (route.method === "GET") return send(res, 200, route.name === "orders" ? api.orders(guild) : api.guildDetail(guild));

    // Two writes to one server at once could overwrite each other's side effects
    if (busy.has(guildId)) throw new HttpError(409, MESSAGES.busy);
    busy.add(guildId);
    try {
      if (route.name === "settings") return send(res, 200, await api.putSettings(guild, match[2], body));
      if (route.name === "audit") return send(res, 200, await api.runHealthCheck(guild, ctx));
      if (route.name === "fix") return send(res, 200, await api.fix(guild, body));
      return send(res, 200, await api.postPanel(guild));
    } finally {
      busy.delete(guildId);
    }
  }

  // Strict static handler: nothing outside dashboard/, ever
  async function serveStatic(req, res, rawPath) {
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, MESSAGES.method, { Allow: "GET, HEAD" });
    if (/%2e|%00|%2f|%5c|\\|\0/i.test(rawPath)) return fail(res, 404, MESSAGES.notFound);
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return fail(res, 400, MESSAGES.notFound);
    }
    if (decoded.includes("\0") || decoded.split("/").some((part) => part === ".." || part === ".")) return fail(res, 404, MESSAGES.notFound);
    const relative = decoded === "/" ? "/index.html" : decoded;
    const file = path.resolve(staticRoot, `.${relative}`);
    if (file !== staticRoot && !file.startsWith(staticRoot + path.sep)) return fail(res, 404, MESSAGES.notFound);
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return fail(res, 404, MESSAGES.notFound);
    let info;
    try {
      info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      return fail(res, 404, MESSAGES.notFound);
    }
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const cache = path.basename(file) === "index.html" ? "no-cache" : "public, max-age=300";
    if (req.headers["if-none-match"] === etag) return send(res, 304, "", { ETag: etag, "Cache-Control": cache });
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.length, ETag: etag, "Cache-Control": cache });
    res.end(req.method === "HEAD" ? undefined : data);
  }

  async function handle(req, res) {
    securityHeaders(res);
    const target = String(req.url ?? "");
    if (!target.startsWith("/") || target.startsWith("//")) return fail(res, 400, MESSAGES.notFound);
    const queryAt = target.indexOf("?");
    const rawPath = queryAt < 0 ? target : target.slice(0, queryAt);
    const ip = clientIp(req);

    const isApi = rawPath.startsWith("/api/") || rawPath.startsWith("/auth/");
    if (!isApi) {
      if (limiter.hit(`a:${ip}`, limits.assets)) return fail(res, 429, MESSAGES.tooMany, { "Retry-After": "60" });
      return serveStatic(req, res, rawPath);
    }

    const cookies = parseCookies(req.headers.cookie);
    const session = auth.sessionFrom(cookies);
    const wait = session ? limiter.hit(`s:${session.id}`, limits.session) : limiter.hit(`i:${ip}`, limits.anonymous);
    if (wait) return fail(res, 429, MESSAGES.tooMany, { "Retry-After": String(wait) });

    let route = null;
    let match = null;
    let methodMismatch = false;
    for (const candidate of ROUTES) {
      const m = candidate.re.exec(rawPath);
      if (!m) continue;
      if (candidate.method === req.method) {
        route = candidate;
        match = m;
        break;
      }
      methodMismatch = true;
    }
    if (!route) {
      if (methodMismatch) return fail(res, 405, MESSAGES.method);
      return fail(res, 404, MESSAGES.notFound);
    }

    if (route.public) return authRoute(route.name, req, res, new URL(target, publicUrl), session, cookies);
    if (!session) return fail(res, 401, MESSAGES.unauthenticated);
    return apiRoute(route, match, req, res, session);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (error instanceof HttpError) {
        if (res.headersSent) return res.destroy();
        const headers = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {};
        return fail(res, error.status, error.message, headers);
      }
      // The real error stays in the log, the browser only learns that something broke
      console.error("Dashboard error:", error);
      if (res.headersSent) return res.destroy();
      fail(res, 500, MESSAGES.internal);
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  const sweeper = setInterval(() => {
    auth.purgeExpired();
    limiter.prune();
  }, 5 * 60_000);
  sweeper.unref();

  return {
    server,
    auth,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(dash.port) || 0, options.host ?? dash.host ?? "127.0.0.1", () => resolve(server.address().port));
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

let running = null;

// Starts the dashboard when it is fully configured. Returns the port, or null when it stays off.
export async function startDashboard(client, options = {}) {
  const dash = { ...config.dashboard, ...options };
  if (!dash.clientSecret || !dash.sessionSecret || !dash.publicUrl) return null;
  if (running) await stopDashboard();
  running = createDashboard(client, options);
  const port = await running.listen();
  console.log(`Dashboard: http://127.0.0.1:${port} (public ${dash.publicUrl})`);
  return port;
}

export async function stopDashboard() {
  const current = running;
  running = null;
  if (current) await current.close();
}
