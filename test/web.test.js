import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "web-test-"));

const { createDashboard, startDashboard, stopDashboard, MAX_BODY } = await import("../src/web/server.js");
const { getSection, setSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const { createOrder, setCheckoutUrl } = await import("../src/pay/orders.js");
const { attachChannel, reserveTicket } = await import("../src/tickets/store.js");

const PUBLIC = "https://dash.example.test";
const ORIGIN = PUBLIC;

// ---------------------------------------------------------------- fake Discord world

const G1 = "111111111111111111"; // free
const G2 = "222222222222222222"; // pro
const G3 = "333333333333333333"; // breaks when read
const G4 = "444444444444444444"; // the bot is not there
const G5 = "555555555555555555"; // the user is a plain member
const ADMIN = "700000000000000001";
const PLAIN = "700000000000000002";
const ADMIN2 = "700000000000000003";
const ADMIN3 = "700000000000000004";

let seq = 800000000000000000n;
const nextId = () => String((seq += 1n));

// Live permissions per guild and user, as Discord would answer members.fetch
const access = new Map();
const grantAccess = (guildId, userId, bits) => access.set(`${guildId}:${userId}`, bits);

function textChannel(id, name, type = ChannelType.GuildText) {
  const store = new Map();
  const channel = {
    id,
    name,
    type,
    rawPosition: Number(id.slice(-2)),
    parentId: null,
    store,
    messages: {
      fetch: async (messageId) => {
        const m = store.get(messageId);
        if (!m) throw new Error("Unknown Message");
        return m;
      },
    },
    send: async (payload) => {
      const m = { id: nextId(), author: { id: "1" }, payload, edits: [], edit: async (p) => void m.edits.push(p) };
      store.set(m.id, m);
      return m;
    },
  };
  return channel;
}

function makeGuild(id, name) {
  const everyone = { id, name: "@everyone", position: 0, managed: false, permissions: 0n };
  const roles = new Map([[id, everyone]]);
  const addRole = (suffix, role) => roles.set(`${id.slice(0, 1)}${suffix}`, { id: `${id.slice(0, 1)}${suffix}`, managed: false, permissions: 0n, position: 1, ...role });
  addRole("600000000000000001", { name: "Thành viên" });
  addRole("600000000000000002", { name: "Quản trị", permissions: P.Administrator, position: 2 });
  addRole("600000000000000003", { name: "Bot khác", managed: true });
  addRole("600000000000000004", { name: "Staff", position: 3 });
  addRole("600000000000000005", { name: "Cao hơn bot", position: 20 });

  const ch = (suffix) => `${id.slice(0, 1)}${suffix}`;
  const channels = new Map();
  for (const c of [
    textChannel(ch("400000000000000001"), "chung"),
    textChannel(ch("400000000000000002"), "tin-tuc", ChannelType.GuildAnnouncement),
    textChannel(ch("400000000000000003"), "phong-voice", ChannelType.GuildVoice),
    textChannel(ch("400000000000000004"), "ticket-khu", ChannelType.GuildCategory),
    textChannel(ch("400000000000000005"), "log"),
  ]) {
    channels.set(c.id, c);
  }

  const ruleStore = new Map();
  const guild = {
    id,
    name,
    icon: null,
    verificationLevel: 0,
    explicitContentFilter: 0,
    memberCount: 10,
    roles: { cache: roles, everyone },
    channels: { cache: channels },
    verificationCalls: [],
    ruleStore,
    autoModerationRules: {
      fetch: async () => new Map(ruleStore),
      create: async (payload) => {
        const rule = { id: nextId(), ...payload };
        ruleStore.set(rule.id, rule);
        return rule;
      },
      edit: async (ruleId, payload) => void ruleStore.set(ruleId, { ...ruleStore.get(ruleId), ...payload }),
      delete: async (ruleId) => void ruleStore.delete(ruleId),
    },
    members: {
      me: { id: "1", permissions: { has: () => true }, roles: { highest: { position: 10 } } },
      fetch: async (arg) => {
        const userId = typeof arg === "string" ? arg : arg.user;
        const bits = access.get(`${id}:${userId}`);
        if (bits === undefined) throw new Error("Unknown Member");
        return { permissions: { has: (flag) => (bits & flag) !== 0n } };
      },
    },
    setVerificationLevel: async (level) => {
      guild.verificationCalls.push(level);
      guild.verificationLevel = level;
    },
    setExplicitContentFilter: async (level) => {
      guild.explicitContentFilter = level;
    },
  };
  return guild;
}

const guilds = new Map([
  [G1, makeGuild(G1, "Server Miễn Phí")],
  [G2, makeGuild(G2, "Server Pro")],
  [G3, makeGuild(G3, "Server Hỏng")],
  [G5, makeGuild(G5, "Server Người Lạ")],
]);
// A cache that explodes when read, to prove unexpected errors never leak
guilds.get(G3).channels.cache = { get: () => undefined, values: () => { throw new Error("secret internal detail"); } };
const client = { guilds: { cache: guilds } };

grantAccess(G1, ADMIN, P.Administrator);
grantAccess(G2, ADMIN, P.Administrator);
grantAccess(G3, ADMIN, P.Administrator);
grantAccess(G5, ADMIN, P.SendMessages);
grantAccess(G1, ADMIN2, P.Administrator);
grantAccess(G1, ADMIN3, P.Administrator);
grantAccess(G1, PLAIN, P.SendMessages);
grant(G2, "pro", 30);

const USERS = {
  admin: {
    profile: { id: ADMIN, username: "thaunho", global_name: "Anh Thầu", avatar: "abc123" },
    guilds: [
      { id: G1, name: "x", owner: false, permissions: "8" },
      { id: G2, name: "x", owner: false, permissions: "8" },
      { id: G3, name: "x", owner: false, permissions: "8" },
      { id: G4, name: "x", owner: true, permissions: "8" },
      { id: G5, name: "x", owner: false, permissions: "32" },
      { id: "not-an-id", name: "x", owner: false, permissions: "8" },
    ],
  },
  plain: { profile: { id: PLAIN, username: "khach", avatar: null }, guilds: [{ id: G1, name: "x", owner: false, permissions: "0" }] },
  admin2: { profile: { id: ADMIN2, username: "hai", avatar: null }, guilds: [{ id: G1, name: "x", owner: false, permissions: "8" }] },
  admin3: { profile: { id: ADMIN3, username: "ba", avatar: null }, guilds: [{ id: G1, name: "x", owner: false, permissions: "8" }] },
};

const discordCalls = [];
const revoked = [];
async function fakeFetch(url, init = {}) {
  const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
  discordCalls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body });
  const u = new URL(url);
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (u.pathname.endsWith("/oauth2/token/revoke")) {
    revoked.push(body.token);
    return reply(200, {});
  }
  if (u.pathname.endsWith("/oauth2/token")) {
    if (!body.code.startsWith("code-") || body.code === "code-fail") return reply(400, { error: "invalid_grant" });
    return reply(200, { access_token: `tok-${body.code.slice(5)}`, refresh_token: "never-kept" });
  }
  const who = String(init.headers?.Authorization ?? "").replace("Bearer tok-", "");
  if (!USERS[who]) return reply(401, {});
  if (u.pathname.endsWith("/users/@me")) return reply(200, USERS[who].profile);
  if (u.pathname.endsWith("/users/@me/guilds")) return reply(200, USERS[who].guilds);
  return reply(404, {});
}

// ---------------------------------------------------------------- the server under test

let clock = 1_800_000_000_000;
let counter = 0;
const random = (n) => {
  const buf = Buffer.alloc(n, 7);
  buf.writeUInt32BE((counter += 1), 0);
  return buf;
};

const staticDir = mkdtempSync(path.join(tmpdir(), "web-static-"));
mkdirSync(path.join(staticDir, "root"));
writeFileSync(path.join(staticDir, "root", "index.html"), "<!doctype html><title>ok</title><p>home</p>");
writeFileSync(path.join(staticDir, "root", "app.js"), "export const ok = 1;");
writeFileSync(path.join(staticDir, "root", ".env"), "TOKEN=hidden");
writeFileSync(path.join(staticDir, "secret.txt"), "TOP-SECRET");

const options = { port: 0, publicUrl: PUBLIC, clientSecret: "cs", sessionSecret: "ss-ss-ss", clientId: "1", fetch: fakeFetch, now: () => clock, random, staticRoot: path.join(staticDir, "root") };
const app = createDashboard(client, options);
const port = await app.listen();
after(() => app.close());

function send(p, { method = "GET", path: target, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const sized = body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length") ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers;
    const req = http.request({ host: "127.0.0.1", port: p, method, path: target, headers: sized }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

let ipCounter = 0;
// One browser: its own address behind the proxy and its own cookie jar
class Browser {
  constructor(p = port) {
    this.port = p;
    this.ip = `10.0.0.${(ipCounter += 1)}`;
    this.jar = {};
    this.csrf = "";
  }

  cookieHeader() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async req(method, target, { headers = {}, body } = {}) {
    const h = { "X-Forwarded-For": this.ip, ...headers };
    if (Object.keys(this.jar).length) h.Cookie = this.cookieHeader();
    const res = await send(this.port, { method, path: target, headers: h, body });
    for (const line of [].concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      if (/Max-Age=0/.test(line)) delete this.jar[name];
      else this.jar[name] = pair.slice(at + 1);
    }
    return res;
  }

  async login(user = "admin", { state } = {}) {
    const start = await this.req("GET", "/auth/login");
    const given = new URL(start.headers.location).searchParams.get("state");
    const back = await this.req("GET", `/auth/callback?code=code-${user}&state=${encodeURIComponent(state ?? given)}`);
    if (back.status === 302) {
      const me = await this.req("GET", "/api/me");
      this.csrf = me.json().csrf;
      this.profile = me.json();
    }
    return { start, back };
  }

  // A state-changing call with every CSRF ingredient, each of which a test can break
  api(method, target, body, { csrf = this.csrf, origin = ORIGIN, type = "application/json", raw } = {}) {
    const headers = {};
    if (csrf !== null) headers["X-CSRF-Token"] = csrf;
    if (origin !== null) headers.Origin = origin;
    if (type !== null) headers["Content-Type"] = type;
    return this.req(method, target, { headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  }
}

async function loggedIn(user = "admin") {
  const b = new Browser();
  await b.login(user);
  return b;
}

const guildUrl = (id, rest = "") => `/api/guilds/${id}${rest}`;
const text = (guildId, suffix) => `${guildId.slice(0, 1)}${suffix}`;

// ---------------------------------------------------------------- login flow

test("login sends the browser to Discord with a signed, short-lived state cookie", async () => {
  const b = new Browser();
  const res = await b.req("GET", "/auth/login");
  assert.equal(res.status, 302);
  const url = new URL(res.headers.location);
  assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "1");
  assert.equal(url.searchParams.get("redirect_uri"), `${PUBLIC}/auth/callback`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "identify guilds");
  assert.ok(url.searchParams.get("state").length >= 20);
  const cookie = [].concat(res.headers["set-cookie"])[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=600/);
});

test("a callback with a wrong, missing or tampered state is refused and creates no session", async () => {
  const wrong = new Browser();
  await wrong.req("GET", "/auth/login");
  const r1 = await wrong.req("GET", "/auth/callback?code=code-admin&state=not-the-state");
  assert.equal(r1.status, 400);
  assert.equal(Object.keys(wrong.jar).filter((k) => k.includes("sid")).length, 0);

  const missing = new Browser();
  const r2 = await missing.req("GET", "/auth/callback?code=code-admin&state=abc");
  assert.equal(r2.status, 400);

  const tampered = new Browser();
  const start = await tampered.req("GET", "/auth/login");
  const state = new URL(start.headers.location).searchParams.get("state");
  const key = Object.keys(tampered.jar).find((k) => k.includes("state"));
  tampered.jar[key] = `${state}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  const r3 = await tampered.req("GET", `/auth/callback?code=code-admin&state=${state}`);
  assert.equal(r3.status, 400);

  const denied = new Browser();
  await denied.req("GET", "/auth/login");
  const r4 = await denied.req("GET", "/auth/callback?error=access_denied&state=x");
  assert.equal(r4.status, 400);
  assert.equal((await new Browser().req("GET", "/api/me")).status, 401);
});

test("a good callback exchanges the code, revokes the token and sets a hardened session cookie", async () => {
  const before = discordCalls.length;
  const b = new Browser();
  const { back } = await b.login("admin");
  assert.equal(back.status, 302);
  assert.equal(back.headers.location, "/");

  const calls = discordCalls.slice(before);
  const exchange = calls.find((c) => c.url.endsWith("/oauth2/token"));
  assert.equal(exchange.body.grant_type, "authorization_code");
  assert.equal(exchange.body.code, "code-admin");
  assert.equal(exchange.body.redirect_uri, `${PUBLIC}/auth/callback`);
  assert.equal(exchange.body.client_secret, "cs");
  assert.ok(revoked.includes("tok-admin"), "the access token is revoked right away");
  assert.equal(calls.at(-1).url.endsWith("/oauth2/token/revoke"), true, "revoked after the data was read");

  const session = [].concat(back.headers["set-cookie"]).find((c) => c.includes("thau_sid"));
  assert.match(session, /^__Host-thau_sid=/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /Secure/);
  assert.match(session, /Path=\//);
  assert.match(session, /Max-Age=604800/);
  const stateCleared = [].concat(back.headers["set-cookie"]).find((c) => c.includes("thau_state"));
  assert.match(stateCleared, /Max-Age=0/);
});

test("the session keeps only guilds the user manages and the bot is in, and never any token", async () => {
  const b = await loggedIn("admin");
  const me = b.profile;
  assert.deepEqual(me.guilds.map((g) => g.id).sort(), [G1, G2, G3].sort());
  assert.equal(me.user.id, ADMIN);
  assert.equal(me.user.name, "Anh Thầu");
  assert.match(me.user.avatarUrl, /^https:\/\/cdn\.discordapp\.com\/avatars\//);
  assert.equal(me.guilds.find((g) => g.id === G2).plan, "pro");
  assert.equal(me.guilds.find((g) => g.id === G1).plan, "free");
  assert.ok(me.csrf.length >= 32);
  const raw = JSON.stringify(me);
  assert.ok(!raw.includes("tok-admin") && !raw.includes("never-kept"));
});

test("a failed code exchange gives a 502 and no session", async () => {
  const b = new Browser();
  const { back } = await b.login("fail");
  assert.equal(back.status, 502);
  assert.equal((await b.req("GET", "/api/me")).status, 401);
});

test("logout destroys the session on the server, not just the cookie", async () => {
  const b = await loggedIn("admin2");
  const stolen = b.cookieHeader();
  const out = await b.req("GET", "/auth/logout");
  assert.equal(out.status, 302);
  assert.equal((await b.req("GET", "/api/me")).status, 401);
  const replay = await send(port, { path: "/api/me", headers: { Cookie: stolen, "X-Forwarded-For": "10.9.9.9" } });
  assert.equal(replay.status, 401);
});

test("forged, unsigned and expired session cookies are refused", async () => {
  const b = await loggedIn("admin2");
  const name = Object.keys(b.jar).find((k) => k.includes("sid"));
  const [id] = b.jar[name].split(".");
  const forged = new Browser();
  forged.jar[name] = `${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  assert.equal((await forged.req("GET", "/api/me")).status, 401);
  const bare = new Browser();
  bare.jar[name] = id;
  assert.equal((await bare.req("GET", "/api/me")).status, 401);

  assert.equal((await b.req("GET", "/api/me")).status, 200);
  clock += 7 * 24 * 60 * 60 * 1000 + 1000;
  assert.equal((await b.req("GET", "/api/me")).status, 401, "a session older than 7 days is gone");
});

test("logging in again replaces the old session, and the number of sessions is capped", async () => {
  const small = createDashboard(client, { ...options, maxSessions: 2 });
  const p = await small.listen();
  try {
    const first = new Browser(p);
    await first.login("admin");
    const second = new Browser(p);
    await second.login("admin2");
    assert.equal((await first.req("GET", "/api/me")).status, 200);
    const third = new Browser(p);
    await third.login("admin3");
    assert.equal((await third.req("GET", "/api/me")).status, 200);
    assert.equal((await first.req("GET", "/api/me")).status, 401, "the oldest session was dropped at the cap");
    assert.equal((await second.req("GET", "/api/me")).status, 200);
  } finally {
    await small.close();
  }
});

test("without https the cookie is not marked Secure and uses no __Host- prefix", async () => {
  const plain = createDashboard(client, { ...options, publicUrl: "http://localhost:8788" });
  const p = await plain.listen();
  try {
    const res = await new Browser(p).req("GET", "/auth/login");
    const cookie = [].concat(res.headers["set-cookie"])[0];
    assert.match(cookie, /^thau_state=/);
    assert.doesNotMatch(cookie, /Secure/);
    assert.match(cookie, /HttpOnly/);
  } finally {
    await plain.close();
  }
});

// ---------------------------------------------------------------- guild authorization

test("a person who is not an admin of the guild gets 403 on it", async () => {
  const b = await loggedIn("plain");
  assert.deepEqual(b.profile.guilds, []);
  assert.equal((await b.req("GET", guildUrl(G1))).status, 403);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/welcome"), { enabled: true })).status, 403);
});

test("a guild that is not in the session, does not exist, or has a bad id is refused", async () => {
  const b = await loggedIn("admin");
  assert.equal((await b.req("GET", guildUrl(G5))).status, 403, "listed by Discord but the person cannot manage it");
  assert.equal((await b.req("GET", guildUrl(G4))).status, 403, "the bot is not in it");
  assert.equal((await b.req("GET", guildUrl("999999999999999999"))).status, 403);
  assert.equal((await b.req("GET", guildUrl("abc"))).status, 400);
  assert.equal((await b.req("GET", guildUrl("1%2e2"))).status, 400);
  const res = await b.req("GET", guildUrl(G5));
  assert.match(res.json().error, /quyền/);
});

test("an admin demoted in the middle of a session loses access at once", async () => {
  const b = await loggedIn("admin2");
  assert.equal((await b.req("GET", guildUrl(G1))).status, 200);
  grantAccess(G1, ADMIN2, P.SendMessages);
  assert.equal((await b.req("GET", guildUrl(G1))).status, 403);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/welcome"), { message: "hack" })).status, 403);
  assert.equal((await b.api("POST", guildUrl(G1, "/audit"), {})).status, 403);
  assert.equal((await b.req("GET", guildUrl(G1, "/orders"))).status, 403);
  assert.notEqual(getSection(G1, "welcome").message, "hack");
  // someone who left the server entirely is refused too
  access.delete(`${G1}:${ADMIN2}`);
  assert.equal((await b.req("GET", guildUrl(G1))).status, 403);
  grantAccess(G1, ADMIN2, P.Administrator);
  assert.equal((await b.req("GET", guildUrl(G1))).status, 200);
});

test("the guild view lists pickers, plan, usage, settings, health, tickets and orders", async () => {
  const b = await loggedIn("admin");
  const open = reserveTicket({ guildId: G1, userId: PLAIN, type: "ho-tro", now: clock });
  attachChannel(open.id, text(G1, "400000000000000001"));
  createOrder({ orderCode: 1760000000001, guildId: G1, userId: ADMIN, channelId: "c", plan: "pro", days: 30, amount: 260000, now: clock });
  const res = await b.req("GET", guildUrl(G1));
  assert.equal(res.status, 200);
  const g = res.json();
  assert.equal(g.name, "Server Miễn Phí");
  assert.equal(g.plan.plan, "free");
  assert.equal(g.plan.limits.tickets, false);
  assert.equal(g.plan.limits.buildsTotal, 2);
  assert.equal(g.usage.builds, 0);
  assert.deepEqual(Object.keys(g.settings).sort(), ["activity", "automod", "digest", "modlog", "security", "stats", "suggest", "tempvoice", "tickets", "welcome"]);
  assert.deepEqual(g.texts.map((c) => c.name).sort(), ["chung", "log", "tin-tuc"]);
  assert.deepEqual(g.voices.map((c) => c.name), ["phong-voice"]);
  assert.deepEqual(g.categories.map((c) => c.name), ["ticket-khu"]);
  const roleNames = g.roles.map((r) => r.name);
  assert.ok(!roleNames.includes("@everyone") && !roleNames.includes("Bot khác"), "managed roles and @everyone are not offered");
  assert.equal(g.roles.find((r) => r.name === "Thành viên").unsafe, false);
  assert.equal(g.roles.find((r) => r.name === "Quản trị").problem, "dangerous");
  assert.equal(g.roles.find((r) => r.name === "Cao hơn bot").problem, "above");
  assert.equal(g.audit.latest, null);
  assert.equal(g.tickets.count, 1);
  assert.equal(g.tickets.list[0].channelName, "chung");
  assert.equal(g.orders.length, 1);
  assert.ok(g.orders.length <= 5);
  assert.ok(g.buy.offers.length > 0);
});

// ---------------------------------------------------------------- CSRF

test("a state-changing request needs the CSRF header, the right Origin and a JSON content type", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/welcome");
  const body = { message: "csrf probe" };
  const cases = [
    ["no token", { csrf: null }],
    ["wrong token", { csrf: "0".repeat(64) }],
    ["a token of the same length but another session", { csrf: (await loggedIn("admin2")).csrf }],
    ["no origin", { origin: null }],
    ["another origin", { origin: "https://evil.example" }],
    ["origin with a path tail trick", { origin: `${PUBLIC}.evil.example` }],
    ["plain text", { type: "text/plain" }],
    ["form encoded", { type: "application/x-www-form-urlencoded" }],
    ["no content type", { type: null }],
  ];
  for (const [label, override] of cases) {
    const res = await b.api("PUT", url, body, override);
    assert.equal(res.status, 403, label);
  }
  assert.notEqual(getSection(G1, "welcome").message, "csrf probe");
  assert.equal((await b.api("PUT", url, body)).status, 200);
  assert.equal(getSection(G1, "welcome").message, "csrf probe");
  assert.equal((await b.api("PUT", url, body, { type: "application/json; charset=utf-8" })).status, 200);
});

test("GET requests never change anything, and every write method is covered by the CSRF check", async () => {
  const b = await loggedIn("admin");
  for (const [method, target] of [["POST", guildUrl(G1, "/audit")], ["POST", guildUrl(G1, "/audit/fix")], ["POST", guildUrl(G1, "/tickets/panel")]]) {
    assert.equal((await b.api(method, target, {}, { csrf: null })).status, 403, `${method} ${target}`);
    assert.equal((await b.api(method, target, {}, { origin: "https://evil.example" })).status, 403);
  }
});

// ---------------------------------------------------------------- settings: welcome

test("welcome settings are validated and stored through the section normalizer", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/welcome");
  const ok = await b.api("PUT", url, {
    enabled: true,
    channelId: text(G1, "400000000000000001"),
    message: "Chào {user} tới {server}",
    newbieRoleId: text(G1, "600000000000000001"),
    verifyEnabled: true,
    verifyRoleId: text(G1, "600000000000000001"),
  });
  assert.equal(ok.status, 200);
  const stored = getSection(G1, "welcome");
  assert.equal(ok.json().value.message, "Chào {user} tới {server}");
  assert.equal(stored.enabled, true);
  assert.equal(stored.channelId, text(G1, "400000000000000001"));
  assert.equal(stored.verifyEnabled, true);
  // a partial update keeps the rest
  assert.equal((await b.api("PUT", url, { message: "Mới" })).status, 200);
  assert.equal(getSection(G1, "welcome").channelId, text(G1, "400000000000000001"));
  // clearing a field with null
  assert.equal((await b.api("PUT", url, { verifyEnabled: false, verifyRoleId: null, channelId: null })).status, 200);
  assert.equal(getSection(G1, "welcome").channelId, null);
});

test("hostile welcome input is refused with 400 and nothing is stored", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/welcome");
  const snapshot = JSON.stringify(getSection(G1, "welcome"));
  const own = (suffix) => text(G1, suffix);
  const cases = {
    "message too long": { message: "x".repeat(501) },
    "huge message": { message: "x".repeat(15000) },
    "message is a number": { message: 42 },
    "message is an object": { message: { $gt: "" } },
    "enabled is a string": { enabled: "true" },
    "channel id is a number": { channelId: 400000000000000001 },
    "channel id is not an id": { channelId: "../../etc/passwd" },
    "channel id has letters": { channelId: "40000000000000000a" },
    "channel of another guild": { channelId: text(G2, "400000000000000001") },
    "channel that does not exist": { channelId: "123456789012345678" },
    "voice channel as the welcome channel": { channelId: own("400000000000000003") },
    "category as the welcome channel": { channelId: own("400000000000000004") },
    "role of another guild": { newbieRoleId: text(G2, "600000000000000001") },
    "role that does not exist": { newbieRoleId: "123456789012345678" },
    "dangerous role": { newbieRoleId: own("600000000000000002") },
    "bot managed role": { verifyRoleId: own("600000000000000003") },
    "@everyone as a role": { newbieRoleId: G1 },
    "role above the bot": { verifyRoleId: own("600000000000000005") },
    "verify on without a role": { verifyEnabled: true, verifyRoleId: null },
    "role list instead of id": { newbieRoleId: [own("600000000000000001")] },
  };
  for (const [label, body] of Object.entries(cases)) {
    const res = await b.api("PUT", url, body);
    assert.equal(res.status, 400, label);
    assert.ok(typeof res.json().error === "string" && res.json().error.length > 0, label);
  }
  assert.equal(JSON.stringify(getSection(G1, "welcome")), snapshot);

  const unsafe = await b.api("PUT", url, { newbieRoleId: own("600000000000000002") });
  assert.match(unsafe.json().error, /Thầu từ chối role/);
});

test("bodies that are not a JSON object, and unknown sections, are rejected", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/welcome");
  assert.equal((await b.api("PUT", url, undefined, { raw: "{not json" })).status, 400);
  assert.equal((await b.api("PUT", url, undefined, { raw: "[1,2]" })).status, 400);
  assert.equal((await b.api("PUT", url, undefined, { raw: "null" })).status, 400);
  assert.equal((await b.api("PUT", url, undefined, { raw: '"text"' })).status, 400);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/backups"), {})).status, 404);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/__proto__"), {})).status, 404);
  // unknown and prototype-polluting fields are ignored, never stored
  const res = await b.api("PUT", url, undefined, { raw: '{"__proto__":{"admin":true},"extra":1,"message":"ok"}' });
  assert.equal(res.status, 200);
  assert.equal({}.admin, undefined);
  assert.equal(Object.hasOwn(res.json().value, "extra"), false);
});

// ---------------------------------------------------------------- settings: automod

test("a free server can run the gentle level and sync the Discord rules, nothing more", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/automod");
  const guild = guilds.get(G1);
  for (const [label, body] of Object.entries({
    "level vua": { enabled: true, level: "vua" },
    "level gat": { enabled: true, level: "gat" },
    "links": { enabled: true, level: "nhe", blockLinks: true },
    "exempt roles": { enabled: true, level: "nhe", exemptRoleIds: [text(G1, "600000000000000001")] },
    "level vua even while off": { enabled: false, level: "vua" },
  })) {
    const res = await b.api("PUT", url, body);
    assert.equal(res.status, 403, label);
    assert.match(res.json().error, /Pro/);
  }
  assert.equal(guild.ruleStore.size, 0);

  const ok = await b.api("PUT", url, { enabled: true, level: "nhe", logChannelId: text(G1, "400000000000000005"), blockInvites: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.json().applied, true);
  assert.ok(guild.ruleStore.size >= 2, "the spam and invite rules were created in Discord");
  const stored = getSection(G1, "automod");
  assert.equal(stored.enabled, true);
  assert.equal(stored.level, "nhe");
  assert.equal(Object.keys(stored.ruleIds).length, guild.ruleStore.size);

  const off = await b.api("PUT", url, { enabled: false, level: "nhe" });
  assert.equal(off.status, 200);
  assert.equal(guild.ruleStore.size, 0, "turning it off removes exactly the rules the bot made");
  assert.equal(getSection(G1, "automod").enabled, false);
});

test("a Pro server can use every level, links and exempt roles, with validated input", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/settings/automod");
  const guild = guilds.get(G2);
  const role = (suffix) => text(G2, suffix);
  const ok = await b.api("PUT", url, {
    enabled: true,
    level: "gat",
    blockLinks: true,
    mentionLimit: 8,
    exemptRoleIds: [role("600000000000000001"), role("600000000000000001"), role("600000000000000004")],
    logChannelId: role("400000000000000005"),
  });
  assert.equal(ok.status, 200);
  const stored = getSection(G2, "automod");
  assert.equal(stored.level, "gat");
  assert.equal(stored.mentionLimit, 8);
  assert.deepEqual(stored.exemptRoleIds, [role("600000000000000001"), role("600000000000000004")]);
  const keys = [...guild.ruleStore.values()].map((r) => r.name);
  assert.ok(keys.length >= 4, "spam, invites, mentions, words and links");

  const snapshot = JSON.stringify(getSection(G2, "automod"));
  const rules = guild.ruleStore.size;
  const cases = {
    "mention limit too low": { mentionLimit: 2 },
    "mention limit too high": { mentionLimit: 21 },
    "mention limit as text": { mentionLimit: "5" },
    "mention limit fractional": { mentionLimit: 4.5 },
    "unknown level": { level: "tan-bao" },
    "level as number": { level: 1 },
    "exempt everyone": { exemptRoleIds: [G2] },
    "exempt role of another guild": { exemptRoleIds: [text(G1, "600000000000000001")] },
    "exempt role that does not exist": { exemptRoleIds: ["123456789012345678"] },
    "too many exempt roles": { exemptRoleIds: Array.from({ length: 21 }, (_, i) => String(100000000000000000 + i)) },
    "exempt not a list": { exemptRoleIds: role("600000000000000001") },
    "exempt with a non id": { exemptRoleIds: ["<script>"] },
    "log channel is a voice channel": { logChannelId: role("400000000000000003") },
    "log channel of another guild": { logChannelId: text(G1, "400000000000000005") },
    "flags as strings": { blockLinks: "yes" },
  };
  for (const [label, body] of Object.entries(cases)) {
    assert.equal((await b.api("PUT", url, body)).status, 400, label);
  }
  assert.equal(JSON.stringify(getSection(G2, "automod")), snapshot);
  assert.equal(guild.ruleStore.size, rules);
});

test("when Discord refuses the AutoMod rules the answer says so and the section does not claim it is on", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G2);
  const original = guild.members.me.permissions.has;
  setSection(G2, "automod", { enabled: false, level: "nhe", ruleIds: {} });
  guild.ruleStore.clear();
  guild.members.me.permissions.has = () => false;
  try {
    const res = await b.api("PUT", guildUrl(G2, "/settings/automod"), { enabled: true, level: "nhe" });
    assert.equal(res.status, 200);
    assert.equal(res.json().applied, false);
    assert.match(res.json().notice, /quyền/);
    assert.equal(getSection(G2, "automod").enabled, false);
  } finally {
    guild.members.me.permissions.has = original;
  }
});

// ---------------------------------------------------------------- settings: tickets

const ticketBody = (g, extra = {}) => ({
  enabled: true,
  panelChannelId: text(g, "400000000000000001"),
  staffRoleId: text(g, "600000000000000004"),
  categoryId: text(g, "400000000000000004"),
  logChannelId: text(g, "400000000000000005"),
  autoCloseHours: 24,
  maxOpenPerUser: 2,
  types: [
    { label: "Hỗ trợ", emoji: "🛟" },
    { label: "Báo lỗi", emoji: "" },
  ],
  ...extra,
});

test("a free server cannot turn tickets on or post the panel", async () => {
  const b = await loggedIn("admin");
  const res = await b.api("PUT", guildUrl(G1, "/settings/tickets"), ticketBody(G1));
  assert.equal(res.status, 403);
  assert.match(res.json().error, /Pro/);
  assert.equal(getSection(G1, "tickets").enabled, false);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/tickets"), { enabled: true })).status, 403);
  assert.equal((await b.api("POST", guildUrl(G1, "/tickets/panel"), {})).status, 403);
  // switching off stays allowed, and nothing else gets through with it
  const off = await b.api("PUT", guildUrl(G1, "/settings/tickets"), { enabled: false, maxOpenPerUser: 5 });
  assert.equal(off.status, 200);
  assert.equal(getSection(G1, "tickets").maxOpenPerUser, 1);
});

test("a Pro server saves ticket settings, posts the panel and keeps it in sync", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/settings/tickets");
  const panelChannel = guilds.get(G2).channels.cache.get(text(G2, "400000000000000001"));

  const saved = await b.api("PUT", url, ticketBody(G2));
  assert.equal(saved.status, 200);
  const value = saved.json().value;
  assert.deepEqual(value.types.map((t) => t.key), ["ho-tro", "bao-loi"], "button ids are made on the server");
  assert.equal(value.maxOpenPerUser, 2);
  assert.equal(value.panelMessageId, null);
  assert.equal(panelChannel.store.size, 0, "saving alone does not post anything");

  const posted = await b.api("POST", guildUrl(G2, "/tickets/panel"), {});
  assert.equal(posted.status, 200);
  const messageId = getSection(G2, "tickets").panelMessageId;
  assert.ok(messageId && panelChannel.store.has(messageId));
  const panel = panelChannel.store.get(messageId).payload;
  assert.equal(panel.components[0].components.length, 2);

  // saving again edits the posted panel instead of posting another
  const again = await b.api("PUT", url, ticketBody(G2, { types: [{ key: "ho-tro", label: "Hỗ trợ", emoji: "🛟" }, { label: "Góp ý", emoji: "" }, { label: "Khác" }] }));
  assert.equal(again.status, 200);
  assert.equal(panelChannel.store.size, 1);
  assert.equal(panelChannel.store.get(messageId).edits.length, 1);
  assert.equal(panelChannel.store.get(messageId).edits[0].components[0].components.length, 3);

  // moving the panel to another channel retires the old buttons
  const moved = await b.api("PUT", url, { panelChannelId: text(G2, "400000000000000002") });
  assert.equal(moved.status, 200);
  assert.equal(getSection(G2, "tickets").panelMessageId, null);
  assert.deepEqual(panelChannel.store.get(messageId).edits.at(-1), { components: [] });

  // turning tickets off takes the buttons off the panel
  const repost = await b.api("POST", guildUrl(G2, "/tickets/panel"), {});
  assert.equal(repost.status, 200);
  const newChannel = guilds.get(G2).channels.cache.get(text(G2, "400000000000000002"));
  const newId = getSection(G2, "tickets").panelMessageId;
  assert.equal((await b.api("PUT", url, { enabled: false })).status, 200);
  assert.deepEqual(newChannel.store.get(newId).edits.at(-1), { components: [] });
  assert.equal(getSection(G2, "tickets").panelMessageId, null);
});

test("hostile ticket input is refused with 400", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/settings/tickets");
  setSection(G2, "tickets", { enabled: false });
  const snapshot = JSON.stringify(getSection(G2, "tickets"));
  const many = Array.from({ length: 6 }, (_, i) => ({ label: `Loại ${i}`, emoji: "" }));
  const cases = {
    "six types": { types: many },
    "no types": { types: [] },
    "types not a list": { types: "ho-tro" },
    "type is a string": { types: ["Hỗ trợ"] },
    "type without a label": { types: [{ label: "", emoji: "" }] },
    "label of 41 characters": { types: [{ label: "x".repeat(41) }] },
    "label is a number": { types: [{ label: 5 }] },
    "duplicate labels": { types: [{ label: "A" }, { label: "a" }] },
    "emoji that is plain text": { types: [{ label: "A", emoji: "abc" }] },
    "emoji too long": { types: [{ label: "A", emoji: "🛟".repeat(9) }] },
    "staff role is everyone": { staffRoleId: G2 },
    "staff role is a bot role": { staffRoleId: text(G2, "600000000000000003") },
    "staff role of another guild": { staffRoleId: text(G1, "600000000000000004") },
    "panel channel is voice": { panelChannelId: text(G2, "400000000000000003") },
    "panel channel of another guild": { panelChannelId: text(G1, "400000000000000001") },
    "category is a text channel": { categoryId: text(G2, "400000000000000001") },
    "log channel does not exist": { logChannelId: "123456789012345678" },
    "auto close too high": { autoCloseHours: 721 },
    "auto close negative": { autoCloseHours: -1 },
    "max open zero": { maxOpenPerUser: 0 },
    "max open as text": { maxOpenPerUser: "2" },
    "enabled without staff": { staffRoleId: null },
    "enabled without panel channel": { panelChannelId: null },
  };
  for (const [label, extra] of Object.entries(cases)) {
    const res = await b.api("PUT", url, ticketBody(G2, extra));
    assert.equal(res.status, 400, label);
  }
  assert.equal(JSON.stringify(getSection(G2, "tickets")), snapshot);
  assert.equal((await b.api("POST", guildUrl(G2, "/tickets/panel"), {})).status, 400, "no panel without a channel and staff role");
});

// ---------------------------------------------------------------- health check

test("the health check runs, offers confirmed fixes and is limited to once a minute per guild", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/audit");
  const first = await b.api("POST", url, {});
  assert.equal(first.status, 200);
  const view = first.json();
  assert.equal(typeof view.latest.score, "number");
  assert.ok(view.latest.findings.length > 0);
  const fixIds = view.fixes.map((f) => f.id).sort();
  assert.deepEqual(fixIds, ["content-filter", "verification-medium"]);
  assert.ok(view.fixes.every((f) => f.title && f.change), "each fix says exactly what it changes");
  assert.equal(view.history.length, 1);

  const second = await b.api("POST", url, {});
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers["retry-after"]) > 0);
  // another guild has its own allowance, and the same person can run it there
  assert.equal((await b.api("POST", guildUrl(G2, "/audit"), {})).status, 200);

  clock += 61_000;
  const third = await b.api("POST", url, {});
  assert.equal(third.status, 200);
  assert.equal(third.json().history.length, 2);
  assert.equal((await b.req("GET", guildUrl(G1))).json().audit.latest.score, third.json().latest.score);
});

test("a fix is applied only for a known fix id", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/audit/fix");
  const guild = guilds.get(G1);
  for (const body of [{}, { fixId: 5 }, { fixId: "rm-rf" }, { fixId: "__proto__" }, { fixId: ["verification-medium"] }, { fixId: "constructor" }]) {
    assert.equal((await b.api("POST", url, body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(guild.verificationCalls, []);
  const done = await b.api("POST", url, { fixId: "verification-medium" });
  assert.equal(done.status, 200);
  assert.equal(done.json().changed, true);
  assert.deepEqual(guild.verificationCalls, [2]);
  const again = await b.api("POST", url, { fixId: "verification-medium" });
  assert.equal(again.json().changed, false, "applying twice changes nothing the second time");
});

// ---------------------------------------------------------------- orders

test("the orders endpoint lists only this guild's orders and never a checkout link or buyer", async () => {
  const b = await loggedIn("admin");
  createOrder({ orderCode: 1760000000002, guildId: G2, userId: ADMIN, channelId: "chan-77", plan: "plus", days: 90, amount: 1500000, now: clock });
  setCheckoutUrl(1760000000002, "https://pay.example.test/checkout/SECRET-LINK");
  createOrder({ orderCode: 1760000000003, guildId: G1, userId: PLAIN, channelId: "chan-88", plan: "pro", days: 30, amount: 260000, now: clock + 1 });
  setCheckoutUrl(1760000000003, "https://pay.example.test/checkout/OTHER-SECRET");

  const res = await b.req("GET", guildUrl(G2, "/orders"));
  assert.equal(res.status, 200);
  const raw = res.text;
  assert.ok(!/SECRET|checkout|pay\.example|chan-77|chan-88/.test(raw), "no checkout url, buyer or channel");
  assert.ok(!raw.includes(PLAIN));
  const { orders } = res.json();
  assert.equal(orders.length, 1);
  assert.deepEqual(Object.keys(orders[0]).sort(), ["amount", "code", "createdAt", "currency", "days", "paidAt", "plan", "status"]);
  assert.equal(orders[0].plan, "plus");
  assert.equal(orders[0].status, "PENDING");
  assert.ok(!(await b.req("GET", guildUrl(G2))).text.match(/SECRET|checkout/), "the guild view hides them as well");
});

// ---------------------------------------------------------------- limits

test("anonymous requests are limited to 20 a minute per address, and the window resets", async () => {
  const b = new Browser();
  for (let i = 0; i < 20; i += 1) assert.equal((await b.req("GET", "/api/me")).status, 401, `request ${i + 1}`);
  const blocked = await b.req("GET", "/api/me");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  assert.match(blocked.json().error, /Thử lại/);
  // login attempts count against the same allowance
  assert.equal((await b.req("GET", "/auth/login")).status, 429);
  // another address is not affected
  assert.equal((await new Browser().req("GET", "/api/me")).status, 401);
  clock += 61_000;
  assert.equal((await b.req("GET", "/api/me")).status, 401);
});

test("a session is limited to 120 requests a minute", async () => {
  const b = await loggedIn("admin3");
  let blockedAt = 0;
  for (let i = 1; i <= 125; i += 1) {
    const res = await b.req("GET", "/api/me");
    if (res.status === 429) {
      blockedAt = i;
      break;
    }
  }
  assert.ok(blockedAt > 100 && blockedAt <= 121, `limited at request ${blockedAt}`);
  clock += 61_000;
  assert.equal((await b.req("GET", "/api/me")).status, 200);
});

test("request bodies above 20 KB get 413, broken JSON gets 400", async () => {
  const b = await loggedIn("admin2");
  const url = guildUrl(G1, "/settings/welcome");
  const big = JSON.stringify({ message: "x".repeat(MAX_BODY + 10) });
  const declared = await b.api("PUT", url, undefined, { raw: big });
  assert.equal(declared.status, 413);
  assert.match(declared.json().error, /20 KB/);

  // no content-length: the body is counted as it streams in
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: "PUT", path: url, headers: { "X-Forwarded-For": b.ip, Cookie: b.cookieHeader(), "X-CSRF-Token": b.csrf, Origin: ORIGIN, "Content-Type": "application/json", "Transfer-Encoding": "chunked" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    for (let i = 0; i < 6; i += 1) req.write("a".repeat(4096));
    req.end();
  });
  assert.equal(chunked, 413);

  const justUnder = JSON.stringify({ message: "ok", junk: "y".repeat(19 * 1024) });
  assert.equal((await b.api("PUT", url, undefined, { raw: justUnder })).status, 200);
  assert.equal((await b.api("PUT", url, undefined, { raw: "{" })).status, 400);
});

// ---------------------------------------------------------------- static files

const rootDir = path.join(staticDir, "root");

test("static files are served with the right type, caching and conditional requests", async () => {
  const b = new Browser();
  const home = await b.req("GET", "/");
  assert.equal(home.status, 200);
  assert.match(home.headers["content-type"], /text\/html/);
  assert.match(home.text, /home/);
  assert.equal(home.headers["cache-control"], "no-cache");
  const js = await b.req("GET", "/app.js");
  assert.equal(js.status, 200);
  assert.match(js.headers["content-type"], /text\/javascript/);
  assert.match(js.headers["cache-control"], /max-age/);
  const again = await b.req("GET", "/app.js", { headers: { "If-None-Match": js.headers.etag } });
  assert.equal(again.status, 304);
  const head = await b.req("HEAD", "/app.js");
  assert.equal(head.status, 200);
  assert.equal(head.text, "");
  assert.equal((await b.req("GET", "/nope.js")).status, 404);
  assert.equal((await b.req("GET", "/.env")).status, 404, "unknown extensions are never served");
  assert.equal((await b.req("POST", "/app.js", { headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405);
});

test("the real dashboard folder is served by default", async () => {
  const real = createDashboard(client, { ...options, staticRoot: undefined });
  const p = await real.listen();
  try {
    const b = new Browser(p);
    const index = await b.req("GET", "/");
    assert.equal(index.status, 200);
    assert.match(index.text, /Bảng điều khiển Thầu/);
    for (const file of ["/app.js", "/styles.css", "/api.js", "/dom.js", "/forms.js", "/views/guild.js", "/views/health.js", "/icon.svg"]) {
      assert.equal((await b.req("GET", file)).status, 200, file);
    }
  } finally {
    await real.close();
  }
});

test("path traversal never leaves the dashboard folder", async () => {
  const b = new Browser();
  const attempts = [
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/%2E%2E/secret.txt",
    "/.%2e/secret.txt",
    "/%2e%2e%2fsecret.txt",
    "/..%2fsecret.txt",
    "/..%5csecret.txt",
    "/..\\secret.txt",
    "/%2e%2e%5csecret.txt",
    "/../../secret.txt",
    "/views/../../secret.txt",
    "/./../secret.txt",
    "/index.html%00.png",
    "/%00",
    "/app.js%00",
    "/%252e%252e/secret.txt",
    "/....//secret.txt",
    "/%c0%ae%c0%ae/secret.txt",
    "/%",
    "/%zz",
  ];
  for (const attempt of attempts) {
    const res = await b.req("GET", attempt);
    assert.ok([400, 404].includes(res.status), `${attempt} gave ${res.status}`);
    assert.ok(!res.text.includes("TOP-SECRET") && !res.text.includes("TOKEN=hidden"), attempt);
  }
  assert.equal((await b.req("GET", "//evil.example/x")).status, 400);
  assert.equal((await b.req("GET", "/app.js?x=../../secret.txt")).status, 200);
  assert.ok(readdirSync(rootDir).includes("index.html"));
});

// ---------------------------------------------------------------- headers, routes, errors

test("every response carries the security headers and no CORS headers", async () => {
  const b = await loggedIn("admin");
  const responses = [
    await b.req("GET", "/"),
    await b.req("GET", "/missing"),
    await b.req("GET", "/api/me"),
    await b.req("GET", "/api/nothing"),
    await b.req("GET", "/auth/login"),
    await b.api("PUT", guildUrl(G1, "/settings/welcome"), { enabled: "bad" }),
    await b.req("GET", "/api/me", { headers: { Origin: "https://evil.example" } }),
    await b.req("OPTIONS", "/api/me", { headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "PUT" } }),
  ];
  for (const res of responses) {
    const csp = res.headers["content-security-policy"];
    for (const part of ["default-src 'self'", "img-src 'self' https://cdn.discordapp.com data:", "style-src 'self'", "script-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"]) {
      assert.ok(csp.includes(part), `${part} in ${res.status}`);
    }
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["referrer-policy"], "no-referrer");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.ok(!Object.keys(res.headers).some((k) => k.startsWith("access-control-")), "no CORS");
  }
  for (const res of responses.slice(2, 7)) assert.equal(res.headers["cache-control"], "no-store");
  assert.notEqual(responses.at(-1).status, 200, "a preflight is never answered with permission");
});

test("unknown routes get 404 and wrong methods get 405", async () => {
  const b = await loggedIn("admin");
  assert.equal((await b.req("GET", "/api/unknown")).status, 404);
  assert.equal((await b.req("GET", guildUrl(G1, "/nothing"))).status, 404);
  assert.equal((await b.req("GET", "/auth/nothing")).status, 404);
  assert.equal((await b.api("POST", "/api/me", {})).status, 405);
  assert.equal((await b.api("DELETE", guildUrl(G1), undefined)).status, 405);
  assert.equal((await b.api("PUT", guildUrl(G1, "/audit"), {})).status, 405);
  assert.equal((await b.api("POST", guildUrl(G1, "/orders"), {})).status, 405);
  assert.equal((await b.req("POST", "/auth/login")).status, 405);
  assert.equal((await b.req("GET", guildUrl(G1, "/settings/welcome"))).status, 405);
  assert.equal((await new Browser().req("PATCH", "/")).status, 405);
});

test("an unexpected error is logged for the owner and the browser gets a generic 500", async () => {
  const b = await loggedIn("admin");
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const res = await b.req("GET", guildUrl(G3));
    assert.equal(res.status, 500);
    assert.ok(!res.text.includes("secret internal detail"));
    assert.deepEqual(Object.keys(res.json()), ["error"]);
  } finally {
    console.error = original;
  }
  assert.ok(logged.some((args) => String(args.join(" ")).includes("Dashboard error") && args.some((a) => a instanceof Error && a.message === "secret internal detail")));
  // the server keeps working afterwards
  assert.equal((await b.req("GET", guildUrl(G1))).status, 200);
});

test("the dashboard stays off without its secrets and starts and stops cleanly with them", async () => {
  assert.equal(await startDashboard(client, { clientSecret: null }), null);
  assert.equal(await startDashboard(client, { sessionSecret: "" }), null);
  assert.equal(await startDashboard(client, { publicUrl: "" }), null);
  const log = console.log;
  console.log = () => {};
  let started;
  try {
    started = await startDashboard(client, { ...options, port: 0 });
  } finally {
    console.log = log;
  }
  assert.ok(Number.isInteger(started) && started > 0);
  const res = await send(started, { path: "/auth/login", headers: { "X-Forwarded-For": "10.77.0.1" } });
  assert.equal(res.status, 302);
  await stopDashboard();
  await assert.rejects(() => send(started, { path: "/" }));
  await stopDashboard();
});

// ---------------------------------------------------------------- security, activity, digest and modlog sections

const textId = (guildId, suffix) => text(guildId, suffix);

test("the new sections are listed in the guild view with their defaults and a read-only overview", async () => {
  const b = await loggedIn("admin");
  const g = (await b.req("GET", guildUrl(G1))).json();
  assert.equal(g.settings.security.raidEnabled, false);
  assert.equal(g.settings.security.lockdown.active, false);
  assert.equal(g.settings.digest.weekday, 1);
  assert.equal(g.settings.modlog.logBans, true);
  assert.equal(g.settings.activity.xpPerMessage, 5);
  assert.deepEqual(Object.keys(g.overview.week).sort(), ["automodBlocks", "joins", "ticketsClosed", "ticketsOpened"]);
  assert.ok(Array.isArray(g.overview.top));
  assert.equal(g.overview.lockdown.active, false);
});

test("security settings are validated field by field and the lockdown record cannot be written from outside", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/security");
  for (const body of [
    { raidJoins: 2 },
    { raidJoins: "8" },
    { raidWindowSec: 301 },
    { raidAction: "ban" },
    { lockMinutes: 0 },
    { raidEnabled: "yes" },
    { alertChannelId: "not-an-id" },
    { alertChannelId: textId(G1, "400000000000000003") },
    { alertChannelId: "999999999999999999" },
  ]) {
    const res = await b.api("PUT", url, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const ok = await b.api("PUT", url, { raidEnabled: true, raidJoins: 6, raidWindowSec: 20, raidAction: "alert", lockMinutes: 5, alertChannelId: textId(G1, "400000000000000005") });
  assert.equal(ok.status, 200);
  assert.equal(ok.json().value.raidJoins, 6);
  assert.equal(getSection(G1, "security").raidAction, "alert");

  // unknown fields, including the lockdown record, are ignored and never stored
  const sneaky = await b.api("PUT", url, { raidJoins: 7, lockdown: { active: true, since: 5, prevVerification: 4, channels: [{ id: textId(G1, "400000000000000001"), sendMessages: "deny" }] } });
  assert.equal(sneaky.status, 200);
  assert.equal(getSection(G1, "security").lockdown.active, false);
  assert.equal(getSection(G1, "security").raidJoins, 7);
});

test("the nuke guard is a Pro feature in the dashboard, switching it off is always allowed", async () => {
  const free = await loggedIn("admin");
  const url1 = guildUrl(G1, "/settings/security");
  const blocked = await free.api("PUT", url1, { nukeEnabled: true });
  assert.equal(blocked.status, 403);
  assert.match(blocked.json().error, /Pro/);
  assert.equal(getSection(G1, "security").nukeEnabled, false);
  assert.equal((await free.api("PUT", url1, { nukeEnabled: false, raidEnabled: true })).status, 200);

  const pro = await loggedIn("admin");
  const url2 = guildUrl(G2, "/settings/security");
  const on = await pro.api("PUT", url2, { nukeEnabled: true, nukeThreshold: 4, nukeWindowSec: 90 });
  assert.equal(on.status, 200);
  assert.equal(getSection(G2, "security").nukeEnabled, true);
  assert.equal((await pro.api("PUT", url2, { nukeEnabled: false })).status, 200);
});

test("activity settings need Pro to turn on, a lapsed plan can still switch them off", async () => {
  const free = await loggedIn("admin");
  const url1 = guildUrl(G1, "/settings/activity");
  const blocked = await free.api("PUT", url1, { enabled: true, xpPerMessage: 10 });
  assert.equal(blocked.status, 403);
  assert.match(blocked.json().error, /Pro/);
  assert.equal(getSection(G1, "activity").enabled, false);
  assert.equal(getSection(G1, "activity").xpPerMessage, 5);
  assert.equal((await free.api("PUT", url1, { enabled: false })).status, 200);

  const pro = await loggedIn("admin");
  const url2 = guildUrl(G2, "/settings/activity");
  assert.equal((await pro.api("PUT", url2, { enabled: true, xpPerMessage: 51 })).status, 400);
  assert.equal((await pro.api("PUT", url2, { enabled: true, dailyCap: 10 })).status, 400);
  assert.equal((await pro.api("PUT", url2, { enabled: true, announceChannelId: textId(G2, "400000000000000003") })).status, 400);
  const ok = await pro.api("PUT", url2, { enabled: true, xpPerMessage: 8, cooldownSec: 30, dailyCap: 400, voiceEnabled: false, voiceXpPerMin: 0, announceChannelId: textId(G2, "400000000000000001") });
  assert.equal(ok.status, 200);
  assert.deepEqual(
    { ...getSection(G2, "activity") },
    { enabled: true, xpPerMessage: 8, cooldownSec: 30, dailyCap: 400, voiceEnabled: false, voiceXpPerMin: 0, announceChannelId: textId(G2, "400000000000000001") },
  );
});

test("digest settings need a channel to be switched on and never accept the schedule marks", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/digest");
  const noChannel = await b.api("PUT", url, { enabled: true });
  assert.equal(noChannel.status, 400);
  assert.match(noChannel.json().error, /kênh/);
  for (const body of [{ weekday: 7 }, { hour: 24 }, { hour: 1.5 }, { auditWeekly: 1 }, { channelId: textId(G1, "400000000000000003") }]) {
    assert.equal((await b.api("PUT", url, body)).status, 400, JSON.stringify(body));
  }
  const ok = await b.api("PUT", url, { enabled: true, channelId: textId(G1, "400000000000000005"), weekday: 5, hour: 20, auditWeekly: false, lastSentAt: 99, lastAuditAt: 99, lastScore: 3 });
  assert.equal(ok.status, 200);
  const stored = getSection(G1, "digest");
  assert.equal(stored.weekday, 5);
  assert.equal(stored.hour, 20);
  assert.equal(stored.lastSentAt, 0);
  assert.equal(stored.lastAuditAt, 0);
  assert.equal(stored.lastScore, null);
});

test("the digest preview posts one embed with no mentions, keeps the schedule untouched and is rate limited", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G2);
  const channelId = textId(G2, "400000000000000005");
  const url = guildUrl(G2, "/digest/preview");

  const none = await b.api("POST", url, {});
  assert.equal(none.status, 400, "no channel saved yet");

  assert.equal((await b.api("PUT", guildUrl(G2, "/settings/digest"), { enabled: true, channelId })).status, 200);
  const res = await b.api("POST", url, {});
  assert.equal(res.status, 200);
  const posted = [...guild.channels.cache.get(channelId).store.values()];
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].payload.allowedMentions, { parse: [] });
  assert.match(posted[0].payload.embeds[0].data.title, /gửi thử/);
  assert.equal(getSection(G2, "digest").lastSentAt, 0, "a preview is not the weekly report");

  const again = await b.api("POST", url, {});
  assert.equal(again.status, 429);
  assert.ok(again.headers["retry-after"]);
  assert.equal(posted.length, 1);

  assert.equal((await new Browser().api("POST", url, {})).status, 401);
});

test("the digest preview says so when the channel is gone or the bot cannot post", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G1);
  const channelId = textId(G1, "400000000000000005");
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/digest"), { enabled: true, channelId })).status, 200);
  const channel = guild.channels.cache.get(channelId);
  channel.permissionsFor = () => ({ has: () => false });
  const denied = await b.api("POST", guildUrl(G1, "/digest/preview"), {});
  assert.equal(denied.status, 502);
  assert.match(denied.json().error, /thiếu quyền/);
  delete channel.permissionsFor;
  guild.channels.cache.delete(channelId);
  clock += 120_000;
  const gone = await b.api("POST", guildUrl(G1, "/digest/preview"), {});
  assert.equal(gone.status, 400);
  guild.channels.cache.set(channelId, channel);
});

test("modlog settings are validated and need a channel to be switched on", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/modlog");
  assert.equal((await b.api("PUT", url, { enabled: true })).status, 400);
  assert.equal((await b.api("PUT", url, { logBans: "no" })).status, 400);
  assert.equal((await b.api("PUT", url, { channelId: textId(G1, "400000000000000004") })).status, 400);
  const ok = await b.api("PUT", url, { enabled: true, channelId: textId(G1, "400000000000000005"), logTimeouts: false });
  assert.equal(ok.status, 200);
  assert.equal(getSection(G1, "modlog").logTimeouts, false);
  assert.equal(getSection(G1, "modlog").logBans, true);
});

test("the new settings routes need a login, an admin, and the CSRF ingredients", async () => {
  const anon = new Browser();
  assert.equal((await anon.api("PUT", guildUrl(G1, "/settings/security"), { raidEnabled: true }, { csrf: "x" })).status, 401);
  const plain = new Browser();
  await plain.login("plain");
  assert.equal((await plain.api("PUT", guildUrl(G1, "/settings/modlog"), { enabled: false })).status, 403);
  const b = await loggedIn("admin");
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/digest"), { hour: 3 }, { csrf: "wrong" })).status, 403);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/digest"), { hour: 3 }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await b.api("POST", guildUrl(G1, "/security/unlock"), {}, { csrf: null })).status, 403);
  assert.equal((await b.api("PUT", guildUrl(G1, "/settings/nonsense"), {})).status, 404);
});

// What a channel looks like while a lockdown holds it: @everyone is denied SendMessages
const lockedOverwrites = (guildId) => new Map([[guildId, { allow: { has: () => false }, deny: { has: (flag) => flag === P.SendMessages } }]]);

test("unlock puts back exactly what the lockdown record names, and refuses when there is no lockdown", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G2);
  const url = guildUrl(G2, "/security/unlock");
  assert.equal((await b.api("POST", url, {})).status, 409);

  const calls = [];
  const a = guild.channels.cache.get(textId(G2, "400000000000000001"));
  const other = guild.channels.cache.get(textId(G2, "400000000000000002"));
  const untouched = guild.channels.cache.get(textId(G2, "400000000000000005"));
  for (const c of [a, other, untouched]) c.permissionOverwrites = { cache: lockedOverwrites(G2), edit: async (role, perms) => void calls.push({ channel: c.id, role: role.id ?? role, perms }) };
  guild.verificationLevel = 2;
  setSection(G2, "security", {
    ...getSection(G2, "security"),
    lockdown: { active: true, since: 5, prevVerification: 1, channels: [{ id: a.id, sendMessages: "neutral" }, { id: other.id, sendMessages: "allow" }, { id: "999999999999999999", sendMessages: "deny" }] },
  });
  const res = await b.api("POST", url, {});
  assert.equal(res.status, 200);
  assert.equal(res.json().applied, true);
  assert.deepEqual(guild.verificationCalls.at(-1), 1);
  assert.equal(guild.verificationLevel, 1);
  assert.deepEqual(calls, [
    { channel: a.id, role: G2, perms: { SendMessages: null } },
    { channel: other.id, role: G2, perms: { SendMessages: true } },
  ]);
  assert.equal(getSection(G2, "security").lockdown.active, false);
  assert.deepEqual(getSection(G2, "security").lockdown.channels, []);
  assert.equal((await b.api("POST", url, {})).status, 409, "a second unlock does nothing");
  assert.equal(calls.length, 2);
});

test("unlock still clears the record and says what it could not restore when a permission is missing", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G2);
  const a = guild.channels.cache.get(textId(G2, "400000000000000001"));
  a.permissionOverwrites = { cache: lockedOverwrites(G2), edit: async () => { throw new Error("Missing Permissions"); } };
  setSection(G2, "security", { ...getSection(G2, "security"), lockdown: { active: true, since: 5, prevVerification: null, channels: [{ id: a.id, sendMessages: "deny" }] } });
  const res = await b.api("POST", guildUrl(G2, "/security/unlock"), {});
  assert.equal(res.status, 200);
  assert.equal(res.json().applied, false);
  assert.match(res.json().notice, /1 chỗ/);
  assert.equal(getSection(G2, "security").lockdown.active, false);
});

// ---------------------------------------------------------------- the public status route

test("GET /status is public, shows only five harmless fields and rounds the server count down", async () => {
  writeFileSync(path.join(process.env.DATA_DIR, "heartbeat"), String(clock - 5_000));
  const res = await new Browser().req("GET", "/status");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /application\/json/);
  assert.equal(res.headers["access-control-allow-origin"], "*");
  assert.ok(!res.headers["set-cookie"], "no session is created");
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ["guilds", "lastHeartbeatAgeSec", "ok", "uptimeSec", "version"]);
  assert.equal(body.ok, true);
  assert.equal(body.version, JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")).version);
  assert.equal(body.guilds, 0, "four servers round down to zero");
  assert.equal(body.lastHeartbeatAgeSec, 5);
  assert.ok(Number.isInteger(body.uptimeSec) && body.uptimeSec >= 0);
  const raw = res.text;
  for (const secret of ["cs", "ss-ss-ss", "x", PUBLIC].filter((s) => s.length > 3)) assert.ok(!raw.includes(secret), `status leaks ${secret}`);
  for (const id of [G1, G2, ADMIN]) assert.ok(!raw.includes(id));
  assert.doesNotMatch(raw, /token|secret|guildId|userId|@/i);
});

test("GET /status reports a stale or missing heartbeat as not ok, takes no other method and is rate limited", async () => {
  writeFileSync(path.join(process.env.DATA_DIR, "heartbeat"), String(clock - 300_000));
  const stale = (await new Browser().req("GET", "/status")).json();
  assert.equal(stale.ok, false);
  assert.equal(stale.lastHeartbeatAgeSec, 300);

  const post = await new Browser().req("POST", "/status");
  assert.equal(post.status, 405);
  const head = await new Browser().req("HEAD", "/status");
  assert.equal(head.status, 200);
  assert.equal(head.text, "");

  const limited = new Browser();
  let last = 0;
  for (let i = 0; i < 40; i += 1) last = (await limited.req("GET", "/status")).status;
  assert.equal(last, 429);
  assert.ok((await new Browser().req("GET", "/status")).status === 200, "another address is not affected");
});

// ---------------------------------------------------------------- the dashboard sources

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const dashboardFiles = walk(path.join(here, "..", "dashboard"));
const webFiles = walk(path.join(here, "..", "src", "web"));

test("dashboard scripts never use innerHTML-style sinks, eval or dynamic code", () => {
  const scripts = dashboardFiles.filter((f) => f.endsWith(".js"));
  assert.ok(scripts.length >= 10);
  const sinks = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\s*\(\s*["'`]/, /setInterval\s*\(\s*["'`]/, /\.srcdoc/, /createContextualFragment/, /DOMParser/];
  for (const file of scripts) {
    const code = readFileSync(file, "utf8");
    for (const sink of sinks) assert.doesNotMatch(code, sink, `${path.basename(file)} matches ${sink}`);
  }
});

test("the page has no inline script or style, and loads nothing from other hosts", () => {
  const html = readFileSync(path.join(here, "..", "dashboard", "index.html"), "utf8");
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const tag of html.match(/<script[^>]*>/gi) ?? []) assert.match(tag, /src="\/[^"]+"/, tag);
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
  const css = readFileSync(path.join(here, "..", "dashboard", "styles.css"), "utf8");
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
  for (const file of dashboardFiles.filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(file, "utf8");
    assert.doesNotMatch(code, /setAttribute\(\s*["']style["']/, path.basename(file));
  }
});

test("no em dashes and no tool or vendor names in the dashboard, its server code or its tests", () => {
  const dash = String.fromCharCode(0x2014);
  const banned = [["cla", "ude"], ["anthro", "pic"], ["co", "pilot"], ["chat", "gpt"], ["open", "ai"]].map((p) => p.join(""));
  const files = [...dashboardFiles, ...webFiles, path.join(here, "web.test.js")];
  for (const file of files) {
    const code = readFileSync(file, "utf8");
    assert.ok(!code.includes(dash), `${path.basename(file)} has an em dash`);
    for (const word of banned) assert.ok(!code.toLowerCase().includes(word), `${path.basename(file)} mentions ${word}`);
  }
});

// ---------------------------------------------------------------- review fixes

test("unlock leaves alone a channel or a verification level that someone changed by hand after the lockdown", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G2);
  const calls = [];
  const kept = guild.channels.cache.get(textId(G2, "400000000000000001"));
  const mine = guild.channels.cache.get(textId(G2, "400000000000000002"));
  kept.permissionOverwrites = { cache: new Map(), edit: async (role, perms) => void calls.push({ channel: kept.id, perms }) };
  mine.permissionOverwrites = { cache: lockedOverwrites(G2), edit: async (role, perms) => void calls.push({ channel: mine.id, perms }) };
  guild.verificationLevel = 4;
  guild.verificationCalls.length = 0;
  setSection(G2, "security", {
    ...getSection(G2, "security"),
    lockdown: { active: true, since: 5, prevVerification: 1, channels: [{ id: kept.id, sendMessages: "allow" }, { id: mine.id, sendMessages: "neutral" }] },
  });
  const res = await b.api("POST", guildUrl(G2, "/security/unlock"), {});
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [{ channel: mine.id, perms: { SendMessages: null } }], "only the channel still as the lockdown left it is touched");
  assert.deepEqual(guild.verificationCalls, [], "a level an admin raised by hand stays");
  assert.equal(guild.verificationLevel, 4);
  assert.equal(getSection(G2, "security").lockdown.active, false);
});

test("GET /status answers a CORS preflight, and no other route does", async () => {
  const pre = await new Browser().req("OPTIONS", "/status", { headers: { Origin: "https://thau.example", "Access-Control-Request-Method": "GET" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers["access-control-allow-origin"], "*");
  assert.equal(pre.headers["access-control-allow-methods"], "GET, OPTIONS");
  assert.equal(pre.text, "");
  const get = await new Browser().req("GET", "/status");
  assert.equal(get.headers["access-control-allow-origin"], "*");
  assert.equal(get.headers["access-control-allow-credentials"], undefined);
  for (const target of ["/api/me", "/auth/login", "/", "/api/guilds/" + G1]) {
    const other = await new Browser().req("OPTIONS", target, { headers: { Origin: "https://thau.example" } });
    assert.equal(other.headers["access-control-allow-origin"], undefined, target + " must not be readable cross-site");
  }
  const apiGet = await new Browser().req("GET", "/api/me");
  assert.equal(apiGet.headers["access-control-allow-origin"], undefined);
});

// ---------------------------------------------------------------- giveaways, role menus, voice rooms, stats, suggestions, blocked words

const giveawayStore = await import("../src/activity/giveaways.js");
const { runGiveaways } = await import("../src/jobs/giveaways.js");
const menuStore = await import("../src/activity/rolemenus.js");
const { getDb } = await import("../src/db.js");

const voiceId = (guildId, n) => text(guildId, `40000000000000001${n}`);
function addVoice(guildId, n, name = `thoai-${n}`) {
  const guild = guilds.get(guildId);
  const id = voiceId(guildId, n);
  if (!guild.channels.cache.has(id)) guild.channels.cache.set(id, textChannel(id, name, ChannelType.GuildVoice));
  return id;
}
const chanOf = (guildId, suffix) => guilds.get(guildId).channels.cache.get(text(guildId, suffix));
const roleId = (guildId, n) => text(guildId, `60000000000000000${n}`);
const MEMBER_ROLE = (g) => roleId(g, 1);
const ADMIN_ROLE = (g) => roleId(g, 2);
const BOT_ROLE = (g) => roleId(g, 3);
const STAFF_ROLE = (g) => roleId(g, 4);
const HIGH_ROLE = (g) => roleId(g, 5);
const lastMessage = (channel) => [...channel.store.values()].at(-1);

const NEW_ROUTES = (g) => [
  ["POST", guildUrl(g, "/giveaways"), { prize: "Quà", minutes: 60, channelId: text(g, "400000000000000001") }],
  ["POST", guildUrl(g, "/giveaways/1/end"), {}],
  ["POST", guildUrl(g, "/giveaways/1/reroll"), { count: 1 }],
  ["POST", guildUrl(g, "/giveaways/1/cancel"), {}],
  ["POST", guildUrl(g, "/rolemenus"), { title: "Menu", mode: "multi", roles: [{ id: MEMBER_ROLE(g) }] }],
  ["PUT", guildUrl(g, "/rolemenus/1"), { title: "Menu", mode: "multi", roles: [{ id: MEMBER_ROLE(g) }] }],
  ["POST", guildUrl(g, "/rolemenus/1/post"), { channelId: text(g, "400000000000000001") }],
  ["DELETE", guildUrl(g, "/rolemenus/1"), {}],
  ["PUT", guildUrl(g, "/settings/tempvoice"), { enabled: false }],
  ["PUT", guildUrl(g, "/settings/stats"), { enabled: false }],
  ["PUT", guildUrl(g, "/settings/suggest"), { enabled: false }],
];

test("every giveaway, role menu and new settings route needs a login, a live admin and every CSRF ingredient", async () => {
  const anon = new Browser();
  for (const [method, url, body] of NEW_ROUTES(G1)) {
    assert.equal((await anon.req(method, url, { headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify(body) })).status, 401, `${method} ${url} without login`);
  }
  const b = await loggedIn("admin");
  for (const [method, url, body] of NEW_ROUTES(G1)) {
    for (const [what, opts] of [["csrf token", { csrf: null }], ["wrong token", { csrf: "nope" }], ["origin", { origin: null }], ["foreign origin", { origin: "https://evil.example" }], ["json type", { type: "text/plain" }]]) {
      assert.equal((await b.api(method, url, body, opts)).status, 403, `${method} ${url} without ${what}`);
    }
  }
  // a server the person does not manage, one the bot is not in, and a plain member
  for (const [method, url, body] of NEW_ROUTES(G5)) assert.equal((await b.api(method, url, body)).status, 403, `${method} ${url} on a server where the person is no admin`);
  for (const [method, url, body] of NEW_ROUTES(G4)) assert.equal((await b.api(method, url, body)).status, 403);
  const plain = await loggedIn("plain");
  for (const [method, url, body] of NEW_ROUTES(G1)) assert.equal((await plain.api(method, url, body)).status, 403, `${method} ${url} as a plain member`);
  // the person's admin right is read from Discord on every call
  grantAccess(G1, ADMIN3, P.SendMessages);
  const gone = await loggedIn("admin3");
  assert.equal((await gone.api("POST", guildUrl(G1, "/giveaways"), NEW_ROUTES(G1)[0][2])).status, 403);
  grantAccess(G1, ADMIN3, P.Administrator);
  // a made-up route and a wrong method are refused before anything runs
  assert.equal((await b.api("POST", guildUrl(G1, "/giveaways/1/explode"), {})).status, 404);
  assert.equal((await b.api("GET", guildUrl(G1, "/giveaways"))).status, 405);
  assert.equal((await b.api("PATCH", guildUrl(G1, "/rolemenus/1"), {})).status, 405);
});

test("giveaway create, end, reroll and cancel go through the same functions as the slash command", async () => {
  const b = await loggedIn("admin");
  const channel = chanOf(G2, "400000000000000001");
  const before = giveawayStore.countActive(G2);
  const made = await b.api("POST", guildUrl(G2, "/giveaways"), { prize: "Nitro", winners: 2, minutes: 60, channelId: channel.id, roleId: MEMBER_ROLE(G2) });
  assert.equal(made.status, 200, made.text);
  const gid = made.json().id;
  assert.match(made.json().notice, /#\d+/);
  const row = giveawayStore.getGiveaway(gid);
  assert.deepEqual({ guild: row.guild_id, prize: row.prize, winners: row.winners, status: row.status, host: row.host_id, role: row.roleId, channel: row.channel_id }, { guild: G2, prize: "Nitro", winners: 2, status: "active", host: ADMIN, role: MEMBER_ROLE(G2), channel: channel.id });
  assert.equal(row.ends_at, clock + 60 * 60_000);
  assert.equal(giveawayStore.countActive(G2), before + 1);
  const posted = lastMessage(channel);
  assert.equal(row.message_id, posted.id);
  assert.deepEqual(posted.payload.allowedMentions, { parse: [] });
  assert.equal(JSON.parse(JSON.stringify(posted.payload.components[0])).components[0].custom_id, `quatang:join:${gid}`);

  const view = (await b.req("GET", guildUrl(G2))).json();
  const listed = view.giveaways.list.find((x) => x.id === gid);
  assert.equal(listed.prize, "Nitro");
  assert.equal(listed.entries, 0);
  assert.equal(listed.channelName, "chung");
  assert.equal(view.overview.counts.giveawaysOpen, before + 1);

  for (const u of ["900000000000000001", "900000000000000002", "900000000000000003"]) giveawayStore.toggleEntry(gid, u);
  const ended = await b.api("POST", guildUrl(G2, `/giveaways/${gid}/end`), {});
  assert.equal(ended.status, 200, ended.text);
  assert.equal(giveawayStore.getGiveaway(gid).status, "ended");
  assert.equal(giveawayStore.getGiveaway(gid).winnerIds.length, 2);
  const announce = lastMessage(channel);
  assert.deepEqual(announce.payload.allowedMentions.parse, []);
  assert.deepEqual([...announce.payload.allowedMentions.users].sort(), [...giveawayStore.getGiveaway(gid).winnerIds].sort());
  assert.equal(announce.edits.length, 0);
  assert.equal(posted.edits.length, 1, "the original message is edited to its final state");
  assert.equal(JSON.parse(JSON.stringify(posted.edits[0].components)).length, 0, "the join button is gone");

  // exactly once: a second end, and the scheduled job, add nothing
  const sent = channel.store.size;
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${gid}/end`), {})).status, 409);
  assert.equal(await runGiveaways(client, { now: clock + 10 * 60 * 60_000 }), 0);
  assert.equal(channel.store.size, sent);
  assert.equal(giveawayStore.getGiveaway(gid).winnerIds.length, 2);

  // reroll picks someone who has not won yet, and only once there is somebody left
  const winners = new Set(giveawayStore.getGiveaway(gid).winnerIds);
  const again = await b.api("POST", guildUrl(G2, `/giveaways/${gid}/reroll`), { count: 5 });
  assert.equal(again.status, 200, again.text);
  const after = giveawayStore.getGiveaway(gid).winnerIds;
  assert.equal(after.length, 3);
  assert.equal(new Set(after).size, 3);
  for (const w of winners) assert.ok(after.includes(w));
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${gid}/reroll`), { count: 1 })).status, 409, "nobody left to draw");
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${gid}/cancel`), {})).status, 409, "an ended giveaway cannot be cancelled");
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${gid}/reroll`), { count: 0 })).status, 400);
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${gid}/reroll`), { count: 1, extra: true })).status, 400);

  // cancel an open one: the message is rewritten, nobody wins
  const second = (await b.api("POST", guildUrl(G2, "/giveaways"), { prize: "Áo", minutes: 10, channelId: channel.id })).json().id;
  const msg = lastMessage(channel);
  const cancelled = await b.api("POST", guildUrl(G2, `/giveaways/${second}/cancel`), {});
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(giveawayStore.getGiveaway(second).status, "cancelled");
  assert.equal(msg.edits.length, 1);
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${second}/end`), {})).status, 409);
  assert.equal(await runGiveaways(client, { now: clock + 10 * 60 * 60_000 }), 0);
});

test("giveaway input is validated, hostile text stays text, and another server's giveaway is out of reach", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/giveaways");
  const channel = text(G2, "400000000000000001");
  const ok = { prize: "Quà", minutes: 60, channelId: channel };
  const rows = () => giveawayStore.listGiveaways(G2, 50).length;
  const start = rows();
  for (const bad of [
    { ...ok, prize: "" },
    { ...ok, prize: "   " },
    { ...ok, prize: "x".repeat(101) },
    { ...ok, prize: 5 },
    { ...ok, winners: 0 },
    { ...ok, winners: 11 },
    { ...ok, winners: 1.5 },
    { ...ok, winners: "2" },
    { ...ok, minutes: 7 },
    { ...ok, minutes: "60" },
    { ...ok, minutes: undefined },
    { ...ok, channelId: undefined },
    { ...ok, channelId: "not-an-id" },
    { ...ok, channelId: text(G1, "400000000000000001") },
    { ...ok, channelId: text(G2, "400000000000000003") },
    { ...ok, channelId: text(G2, "400000000000000004") },
    { ...ok, roleId: text(G1, "600000000000000001") },
    { ...ok, roleId: G2 },
    { ...ok, roleId: "x" },
    { ...ok, hostId: ADMIN2 },
    { ...ok, status: "ended" },
  ]) {
    const res = await b.api("POST", url, bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.ok(res.json().error);
  }
  assert.equal(rows(), start, "nothing was created by a refused request");
  assert.equal((await b.api("POST", url, undefined, { raw: "[1]" })).status, 400);
  assert.equal((await b.api("POST", url, undefined, { raw: "{broken" })).status, 400);

  const xss = "<img src=x onerror=alert(1)>@everyone ‮";
  const made = await b.api("POST", url, { ...ok, prize: xss });
  assert.equal(made.status, 200, made.text);
  assert.match(made.headers["content-type"], /^application\/json/);
  assert.equal(made.headers["x-content-type-options"], "nosniff");
  const stored = giveawayStore.getGiveaway(made.json().id).prize;
  assert.ok(stored.startsWith("<img src=x onerror=alert(1)>@everyone"), "kept as plain text");
  assert.ok(!stored.includes("‮"), "direction override characters are dropped");
  const sent = lastMessage(chanOf(G2, "400000000000000001"));
  assert.deepEqual(sent.payload.allowedMentions, { parse: [] }, "a prize cannot ping");
  const listed = (await b.req("GET", guildUrl(G2))).json().giveaways.list.find((x) => x.id === made.json().id);
  assert.equal(listed.prize, stored);

  // a giveaway of another server is not found, whatever the action
  const foreign = giveawayStore.createGiveaway({ guildId: G1, channelId: text(G1, "400000000000000001"), hostId: ADMIN, prize: "Của G1", winners: 1, endsAt: clock + 60_000 });
  for (const action of ["end", "cancel", "reroll"]) assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${foreign}/${action}`), {})).status, 404, action);
  assert.equal(giveawayStore.getGiveaway(foreign).status, "active");
  assert.equal((await b.api("POST", guildUrl(G2, "/giveaways/999999/end"), {})).status, 404);
  assert.equal((await b.api("POST", guildUrl(G2, "/giveaways/1.5/end"), {})).status, 404);
});

test("giveaways are a Pro feature, cancelling and ending stay possible, and the bot's permissions are checked first", async () => {
  const free = await loggedIn("admin");
  const url = guildUrl(G1, "/giveaways");
  const channel = chanOf(G1, "400000000000000001");
  const blocked = await free.api("POST", url, { prize: "Quà", minutes: 60, channelId: channel.id });
  assert.equal(blocked.status, 403);
  assert.match(blocked.json().error, /Pro/);
  const open = giveawayStore.createGiveaway({ guildId: G1, channelId: channel.id, hostId: ADMIN, prize: "Còn chạy", winners: 1, endsAt: clock + 60_000 });
  giveawayStore.setGiveawayMessage(open, (await channel.send({ content: "x" })).id);
  const ended = giveawayStore.createGiveaway({ guildId: G1, channelId: channel.id, hostId: ADMIN, prize: "Xong", winners: 1, endsAt: clock + 60_000 });
  giveawayStore.toggleEntry(ended, "900000000000000001");
  giveawayStore.closeGiveaway(ended);
  assert.equal((await free.api("POST", guildUrl(G1, `/giveaways/${ended}/reroll`), { count: 1 })).status, 403, "reroll is the feature itself");
  assert.equal((await free.api("POST", guildUrl(G1, `/giveaways/${open}/cancel`), {})).status, 200, "a lapsed plan can still stop it");
  const second = giveawayStore.createGiveaway({ guildId: G1, channelId: channel.id, hostId: ADMIN, prize: "Hai", winners: 1, endsAt: clock + 60_000 });
  assert.equal((await free.api("POST", guildUrl(G1, `/giveaways/${second}/end`), {})).status, 200);
  const free2 = (await free.req("GET", guildUrl(G1))).json();
  assert.equal(free2.plan.limits.giveaways, false);

  // the bot lacks a permission in the target channel: refused with the names, nothing created, nothing sent
  const pro = await loggedIn("admin");
  const target = chanOf(G2, "400000000000000002");
  const real = target.permissionsFor;
  target.permissionsFor = () => ({ has: (flag) => flag !== P.EmbedLinks && flag !== "EmbedLinks" });
  try {
    const count = giveawayStore.listGiveaways(G2, 50).length;
    const size = target.store.size;
    const res = await pro.api("POST", guildUrl(G2, "/giveaways"), { prize: "Quà", minutes: 60, channelId: target.id });
    assert.equal(res.status, 502);
    assert.match(res.json().error, /Nhúng liên kết/);
    assert.equal(giveawayStore.listGiveaways(G2, 50).length, count);
    assert.equal(target.store.size, size);
    // ending and rerolling need to post a result, so they refuse before drawing
    const g = giveawayStore.createGiveaway({ guildId: G2, channelId: target.id, hostId: ADMIN, prize: "Cần quyền", winners: 1, endsAt: clock + 60_000 });
    target.permissionsFor = () => ({ has: (flag) => flag !== "SendMessages" });
    const stuck = await pro.api("POST", guildUrl(G2, `/giveaways/${g}/end`), {});
    assert.equal(stuck.status, 502);
    assert.match(stuck.json().error, /Gửi tin nhắn/);
    assert.equal(giveawayStore.getGiveaway(g).status, "active", "no winners were drawn without being able to say so");
  } finally {
    target.permissionsFor = real;
  }
  // a post that Discord refuses leaves no half-made giveaway behind
  const broken = chanOf(G2, "400000000000000005");
  const realSend = broken.send;
  broken.send = async () => {
    throw new Error("Missing Access");
  };
  try {
    const count = giveawayStore.listGiveaways(G2, 50).length;
    assert.equal((await pro.api("POST", guildUrl(G2, "/giveaways"), { prize: "Quà", minutes: 60, channelId: broken.id })).status, 502);
    assert.equal(giveawayStore.listGiveaways(G2, 50).length, count);
  } finally {
    broken.send = realSend;
  }
});

test("a giveaway made from the dashboard survives a restart and closes exactly once", async () => {
  const b = await loggedIn("admin");
  const channel = chanOf(G2, "400000000000000001");
  const id = (await b.api("POST", guildUrl(G2, "/giveaways"), { prize: "Qua khởi động", minutes: 10, channelId: channel.id })).json().id;
  giveawayStore.toggleEntry(id, "900000000000000009");
  // a fresh dashboard and a fresh browser see it, because the state is in the database
  const second = createDashboard(client, options);
  const p2 = await second.listen();
  try {
    const b2 = new Browser(p2);
    await b2.login("admin");
    const seen = (await b2.req("GET", guildUrl(G2))).json().giveaways.list.find((x) => x.id === id);
    assert.equal(seen.entries, 1);
    assert.equal(seen.status, "active");
  } finally {
    await second.close();
  }
  const sent = channel.store.size;
  assert.equal(await runGiveaways(client, { now: clock + 11 * 60_000 }) >= 1, true);
  assert.equal(channel.store.size, sent + 1, "announced once");
  assert.equal(await runGiveaways(client, { now: clock + 12 * 60_000 }), 0);
  assert.equal((await b.api("POST", guildUrl(G2, `/giveaways/${id}/end`), {})).status, 409, "ending after the job did is a no-op");
  assert.equal(channel.store.size, sent + 1);
});

test("role menus: create, post, edit, refresh and delete, using the same rules as /vaitro", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/rolemenus");
  const channel = chanOf(G2, "400000000000000001");
  const made = await b.api("POST", url, { title: "Chọn màu", mode: "single", roles: [{ id: MEMBER_ROLE(G2), emoji: "🎨" }, { id: STAFF_ROLE(G2) }], channelId: channel.id });
  assert.equal(made.status, 200, made.text);
  const id = made.json().id;
  const menu = menuStore.getMenu(id);
  assert.deepEqual({ guild: menu.guild_id, title: menu.title, mode: menu.mode, roles: menu.roles.map((r) => r.id) }, { guild: G2, title: "Chọn màu", mode: "single", roles: [MEMBER_ROLE(G2), STAFF_ROLE(G2)] });
  assert.ok(menu.message_id, "posted");
  const posted = lastMessage(channel);
  assert.equal(posted.id, menu.message_id);
  assert.deepEqual(posted.payload.allowedMentions, { parse: [] });
  const ids = JSON.parse(JSON.stringify(posted.payload.components[0])).components.map((c) => c.custom_id);
  assert.deepEqual(ids, [`vaitro:t:${id}:${MEMBER_ROLE(G2)}`, `vaitro:t:${id}:${STAFF_ROLE(G2)}`]);

  const view = (await b.req("GET", guildUrl(G2))).json();
  const listed = view.roleMenus.list.find((m) => m.id === id);
  assert.equal(listed.posted, true);
  assert.equal(listed.channelName, "chung");
  assert.deepEqual(listed.roles.map((r) => r.name), ["Thành viên", "Staff"]);
  assert.equal(view.overview.counts.roleMenus, view.roleMenus.count);

  // edit: the stored menu changes, and the panel in the channel is refreshed (same channel, not a second post)
  const size = channel.store.size;
  const edited = await b.api("PUT", guildUrl(G2, `/rolemenus/${id}`), { title: "Chọn lại", mode: "multi", roles: [{ id: STAFF_ROLE(G2), emoji: "" }] });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(menuStore.getMenu(id).title, "Chọn lại");
  assert.equal(menuStore.getMenu(id).mode, "multi");
  assert.equal(menuStore.getMenu(id).roles.length, 1);
  assert.equal(menuStore.getMenu(id).message_id, menu.message_id);
  assert.equal(channel.store.size, size, "refreshed in place, not posted twice");
  assert.equal(posted.edits.length, 1);

  // post again somewhere else
  const other = chanOf(G2, "400000000000000005");
  const moved = await b.api("POST", guildUrl(G2, `/rolemenus/${id}/post`), { channelId: other.id });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(menuStore.getMenu(id).channel_id, other.id);
  assert.equal((await b.api("POST", guildUrl(G2, `/rolemenus/${id}/post`), { channelId: text(G2, "400000000000000003") })).status, 400, "a voice channel is not a place for a panel");
  assert.equal((await b.api("POST", guildUrl(G2, `/rolemenus/${id}/post`), { channelId: text(G1, "400000000000000001") })).status, 400);

  const gone = await b.api("DELETE", guildUrl(G2, `/rolemenus/${id}`), {});
  assert.equal(gone.status, 200, gone.text);
  assert.equal(menuStore.getMenu(id), null);
  assert.equal((await b.api("DELETE", guildUrl(G2, `/rolemenus/${id}`), {})).status, 404);
  assert.equal((await b.api("PUT", guildUrl(G2, `/rolemenus/${id}`), { title: "x", mode: "multi", roles: [{ id: MEMBER_ROLE(G2) }] })).status, 404);
});

test("role menus refuse unsafe roles, bad input and menus of other servers, and write nothing", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/rolemenus");
  const count = () => menuStore.countMenus(G2);
  const start = count();
  const good = { title: "Menu", mode: "multi", roles: [{ id: MEMBER_ROLE(G2) }] };
  const refused = [
    [{ ...good, roles: [{ id: ADMIN_ROLE(G2) }] }, /quyền nguy hiểm/],
    [{ ...good, roles: [{ id: HIGH_ROLE(G2) }] }, /cao hơn/],
    [{ ...good, roles: [{ id: BOT_ROLE(G2) }] }, /quản lý/],
    [{ ...good, roles: [{ id: G2 }] }, /tất cả mọi người/],
    [{ ...good, roles: [{ id: MEMBER_ROLE(G1) }] }, /không có trong server/],
    [{ ...good, roles: [{ id: MEMBER_ROLE(G2) }, { id: MEMBER_ROLE(G2) }] }, /hai lần/],
    [{ ...good, roles: [{ id: MEMBER_ROLE(G2), emoji: "not an emoji" }] }, /Emoji/],
    [{ ...good, roles: [{ id: MEMBER_ROLE(G2), emoji: "x".repeat(9) }] }, /Emoji/],
    [{ ...good, roles: [] }, /1 đến 10/],
    [{ ...good, roles: Array.from({ length: 11 }, () => ({ id: MEMBER_ROLE(G2) })) }, /1 đến 10/],
    [{ ...good, roles: [{ id: MEMBER_ROLE(G2), perms: "8" }] }, /ô lạ/],
    [{ ...good, roles: ["600000000000000001"] }, /đối tượng/],
    [{ ...good, roles: [{ id: "abc" }] }, /mã không hợp lệ/],
    [{ ...good, title: "" }, /Tiêu đề/],
    [{ ...good, title: "x".repeat(101) }, /100/],
    [{ ...good, title: 7 }, /Tiêu đề/],
    [{ ...good, mode: "all" }, /Chế độ/],
    [{ ...good, admin: true }, /ô lạ/],
    [{ ...good, channelId: "zzz" }, /mã không hợp lệ/],
    [{ ...good, channelId: text(G2, "400000000000000003") }, /không đúng loại|không có trong server/],
  ];
  for (const [body, pattern] of refused) {
    const res = await b.api("POST", url, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 120));
    assert.match(res.json().error, pattern, JSON.stringify(body).slice(0, 120));
  }
  assert.equal(count(), start);

  // up to ten roles are fine: nine of them are the same role in the other form, so use the ones that exist
  assert.equal((await b.api("POST", url, { ...good, roles: [{ id: MEMBER_ROLE(G2) }, { id: STAFF_ROLE(G2) }] })).status, 200);
  const mine = menuStore.listMenus(G2).at(-1).id;
  // a role that became unsafe after the menu was made cannot be put in again, and a menu of another server cannot be touched
  const foreign = menuStore.createMenu(G1, text(G1, "400000000000000001"), "Của G1", "multi", [{ id: MEMBER_ROLE(G1), emoji: "" }]);
  assert.equal((await b.api("PUT", guildUrl(G2, `/rolemenus/${foreign}`), good)).status, 404);
  assert.equal((await b.api("DELETE", guildUrl(G2, `/rolemenus/${foreign}`), {})).status, 404);
  assert.equal((await b.api("POST", guildUrl(G2, `/rolemenus/${foreign}/post`), { channelId: text(G2, "400000000000000001") })).status, 404);
  assert.ok(menuStore.getMenu(foreign));
  assert.equal((await b.api("PUT", guildUrl(G2, `/rolemenus/${mine}`), { ...good, roles: [{ id: ADMIN_ROLE(G2) }] })).status, 400);
  assert.equal(menuStore.getMenu(mine).roles.length, 2, "a refused edit changes nothing");
});

test("role menus need the bot's Manage Roles permission and respect the plan's menu limit", async () => {
  const b = await loggedIn("admin");
  const guild = guilds.get(G1);
  const url = guildUrl(G1, "/rolemenus");
  const body = { title: "Menu", mode: "multi", roles: [{ id: MEMBER_ROLE(G1) }] };
  const realPerms = guild.members.me.permissions;
  guild.members.me.permissions = { has: () => false };
  try {
    const res = await b.api("POST", url, body);
    assert.equal(res.status, 502);
    assert.match(res.json().error, /Quản lý role/);
  } finally {
    guild.members.me.permissions = realPerms;
  }
  getDb().prepare("DELETE FROM role_menus WHERE guild_id = ?").run(G1);
  for (let i = 0; i < 3; i += 1) assert.equal((await b.api("POST", url, { ...body, title: `Menu ${i}` })).status, 200);
  const over = await b.api("POST", url, body);
  assert.equal(over.status, 403);
  assert.match(over.json().error, /3 menu vai trò/);
  assert.equal(menuStore.countMenus(G1), 3);
  // the panel is not posted when the bot cannot write there, and the menu is still saved
  const pro = await loggedIn("admin");
  const target = chanOf(G2, "400000000000000002");
  const real = target.permissionsFor;
  target.permissionsFor = () => ({ has: (flag) => flag !== "SendMessages" });
  try {
    const res = await pro.api("POST", guildUrl(G2, "/rolemenus"), { title: "Không đăng được", mode: "multi", roles: [{ id: MEMBER_ROLE(G2) }], channelId: target.id });
    assert.equal(res.status, 200);
    assert.equal(res.json().applied, false);
    assert.match(res.json().notice, /Gửi tin nhắn/);
    assert.equal(menuStore.getMenu(res.json().id).message_id, null);
    assert.equal((await pro.api("POST", guildUrl(G2, `/rolemenus/${res.json().id}/post`), { channelId: target.id })).status, 502);
  } finally {
    target.permissionsFor = real;
  }
});

test("temporary rooms: ids must belong to the server and be voice channels, and the plan caps the lobbies", async () => {
  const free = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/tempvoice");
  const lobby = text(G1, "400000000000000003");
  const second = addVoice(G1, 1);
  for (const [body, status] of [
    [{ lobbyChannelIds: [text(G2, "400000000000000003")] }, 400],
    [{ lobbyChannelIds: [text(G1, "400000000000000001")] }, 400],
    [{ lobbyChannelIds: ["x"] }, 400],
    [{ lobbyChannelIds: "all" }, 400],
    [{ lobbyChannelIds: Array.from({ length: 6 }, (_, i) => String(100000000000000000n + BigInt(i))) }, 400],
    [{ categoryId: text(G1, "400000000000000001") }, 400],
    [{ categoryId: text(G2, "400000000000000004") }, 400],
    [{ nameTemplate: "" }, 400],
    [{ nameTemplate: "x".repeat(61) }, 400],
    [{ nameTemplate: 5 }, 400],
    [{ userLimit: 100 }, 400],
    [{ userLimit: -1 }, 400],
    [{ userLimit: 2.5 }, 400],
    [{ enabled: "yes" }, 400],
    [{ enabled: true }, 400],
    [{ enabled: true, lobbyChannelIds: [] }, 400],
  ]) {
    assert.equal((await free.api("PUT", url, body)).status, status, JSON.stringify(body));
  }
  assert.deepEqual(getSection(G1, "tempvoice").lobbyChannelIds, []);

  // free keeps one lobby
  const calls = [];
  const app2 = createDashboard(client, { ...options, hooks: { syncTempVoice: async (g) => void calls.push(g.id) } });
  const p2 = await app2.listen();
  try {
    const b = new Browser(p2);
    await b.login("admin");
    const ok = await b.api("PUT", url, { enabled: true, lobbyChannelIds: [lobby], nameTemplate: "Phòng của {name}", userLimit: 4, categoryId: text(G1, "400000000000000004") });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json().applied, true);
    assert.deepEqual(calls, [G1], "the room module is asked to sync once");
    assert.deepEqual({ ...getSection(G1, "tempvoice") }, { enabled: true, lobbyChannelIds: [lobby], categoryId: text(G1, "400000000000000004"), nameTemplate: "Phòng của {name}", userLimit: 4 });
    const over = await b.api("PUT", url, { lobbyChannelIds: [lobby, second] });
    assert.equal(over.status, 403);
    assert.match(over.json().error, /1 phòng chờ/);
    assert.deepEqual(getSection(G1, "tempvoice").lobbyChannelIds, [lobby]);
    // a lobby cannot also be a stats channel
    const stats = await b.api("PUT", guildUrl(G1, "/settings/stats"), { channels: [{ channelId: lobby, kind: "members", template: "Người: {n}" }] });
    assert.equal(stats.status, 400);
    assert.match(stats.json().error, /phòng chờ/);
    // an unknown extra field is dropped, never stored
    await b.api("PUT", url, { userLimit: 5, lockdown: true, owner: "x" });
    assert.equal(getSection(G1, "tempvoice").userLimit, 5);
    assert.equal("owner" in getSection(G1, "tempvoice"), false);
    // switching off still works and tells the module
    const off = await b.api("PUT", url, { enabled: false });
    assert.equal(off.status, 200);
    assert.deepEqual(calls, [G1, G1, G1]);
  } finally {
    await app2.close();
  }

  // the Pro server may use up to three
  const pro = await loggedIn("admin");
  const v = [text(G2, "400000000000000003"), addVoice(G2, 1), addVoice(G2, 2), addVoice(G2, 3)];
  assert.equal((await pro.api("PUT", guildUrl(G2, "/settings/tempvoice"), { lobbyChannelIds: v.slice(0, 3) })).status, 200);
  assert.equal((await pro.api("PUT", guildUrl(G2, "/settings/tempvoice"), { lobbyChannelIds: v })).status, 403);
  // a lapsed plan can shrink the list but not grow it
  setSection(G1, "tempvoice", { ...getSection(G1, "tempvoice"), lobbyChannelIds: [lobby, second, addVoice(G1, 2)] });
  assert.equal((await free.api("PUT", url, { lobbyChannelIds: [lobby, second] })).status, 200);
  assert.equal((await free.api("PUT", url, { lobbyChannelIds: [lobby, second, addVoice(G1, 2)] })).status, 403);
});

test("the optional room and stats modules degrade with a clear message instead of failing the save", async () => {
  const gone = createDashboard(client, { ...options, hooks: { syncTempVoice: false, syncStats: false } });
  const p1 = await gone.listen();
  const broken = createDashboard(client, {
    ...options,
    hooks: {
      syncTempVoice: async () => {
        throw new Error("boom");
      },
      syncStats: async () => {
        throw new Error("boom");
      },
    },
  });
  const p2 = await broken.listen();
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const [app, state] of [[p1, "missing"], [p2, "failed"]]) {
      const b = new Browser(app);
      await b.login("admin");
      const t = await b.api("PUT", guildUrl(G2, "/settings/tempvoice"), { enabled: true, lobbyChannelIds: [text(G2, "400000000000000003")] });
      assert.equal(t.status, 200, t.text);
      assert.equal(t.json().applied, false);
      assert.match(t.json().notice, state === "missing" ? /chưa có trong bản thầu/ : /lỗi/);
      assert.equal(getSection(G2, "tempvoice").enabled, true, "the settings are kept either way");
      const s = await b.api("PUT", guildUrl(G2, "/settings/stats"), { enabled: true, channels: [{ channelId: addVoice(G2, 4), kind: "members", template: "Thành viên: {n}" }] });
      assert.equal(s.status, 200, s.text);
      assert.equal(s.json().applied, false);
      assert.match(s.json().notice, state === "missing" ? /chưa có trong bản thầu/ : /lỗi/);
    }
  } finally {
    console.error = quiet;
    await gone.close();
    await broken.close();
  }
  // the real lookup also never throws, whether or not the modules exist yet
  const b = await loggedIn("admin");
  const res = await b.api("PUT", guildUrl(G2, "/settings/tempvoice"), { enabled: true, lobbyChannelIds: [text(G2, "400000000000000003")] });
  assert.equal(res.status, 200);
  assert.equal(typeof res.json().notice, "string");
  // and a missing Manage Channels permission is named
  const guild = guilds.get(G2);
  const real = guild.members.me.permissions;
  guild.members.me.permissions = { has: (flag) => flag !== "ManageChannels" && flag !== P.ManageChannels };
  try {
    const noPerm = await b.api("PUT", guildUrl(G2, "/settings/tempvoice"), { enabled: true, lobbyChannelIds: [text(G2, "400000000000000003")] });
    assert.equal(noPerm.status, 200);
    assert.equal(noPerm.json().applied, false);
    assert.match(noPerm.json().notice, /Quản lý kênh/);
  } finally {
    guild.members.me.permissions = real;
  }
});

test("stats channels: strict entries, voice channels of this server only, capped by the plan", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/settings/stats");
  setSection(G2, "stats", { enabled: false, channels: [] });
  const [a, c, d, e, f] = [addVoice(G2, 5), addVoice(G2, 6), addVoice(G2, 7), addVoice(G2, 8), addVoice(G2, 9)];
  const entry = (channelId, extra = {}) => ({ channelId, kind: "members", template: "Thành viên: {n}", ...extra });
  for (const body of [
    { channels: [entry(text(G1, "400000000000000003"))] },
    { channels: [entry(text(G2, "400000000000000001"))] },
    { channels: [entry(a, { kind: "everything" })] },
    { channels: [entry(a, { template: "Không có số" })] },
    { channels: [entry(a, { template: "" })] },
    { channels: [entry(a, { template: `${"x".repeat(60)}{n}` })] },
    { channels: [entry(a, { template: 4 })] },
    { channels: [entry(a, { permissions: "8" })] },
    { channels: [entry(a), entry(a)] },
    { channels: ["x"] },
    { channels: [null] },
    { channels: "all" },
    { channels: [entry(a), entry(c), entry(d), entry(e), entry(f)] },
    { enabled: true },
    { enabled: true, channels: [] },
    { enabled: 1 },
  ]) {
    assert.equal((await b.api("PUT", url, body)).status, 400, JSON.stringify(body).slice(0, 140));
  }
  const ok = await b.api("PUT", url, { enabled: true, channels: [entry(a), entry(c, { kind: "boosts", template: "Boost: {n}" }), entry(d, { kind: "channels" }), entry(e, { kind: "roles" })] });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(getSection(G2, "stats").channels.length, 4);
  assert.equal(getSection(G2, "stats").channels[1].kind, "boosts");
  const free = await loggedIn("admin");
  const one = addVoice(G1, 5);
  const two = addVoice(G1, 6);
  assert.equal((await free.api("PUT", guildUrl(G1, "/settings/stats"), { channels: [entry(one)] })).status, 200);
  const over = await free.api("PUT", guildUrl(G1, "/settings/stats"), { channels: [entry(one), entry(two)] });
  assert.equal(over.status, 403);
  assert.match(over.json().error, /1 kênh thống kê/);
  // text with markup is kept as text
  const markup = await b.api("PUT", url, { channels: [entry(a, { template: "<b>{n}</b> & co" })] });
  assert.equal(markup.status, 200);
  assert.equal(getSection(G2, "stats").channels[0].template, "<b>{n}</b> & co");
});

test("suggestion settings validate the channel and the staff role, and name what the bot cannot do", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G2, "/settings/suggest");
  for (const body of [
    { channelId: text(G1, "400000000000000001") },
    { channelId: text(G2, "400000000000000003") },
    { channelId: "x" },
    { staffRoleId: text(G1, "600000000000000004") },
    { staffRoleId: G2 },
    { staffRoleId: BOT_ROLE(G2) },
    { enabled: true },
    { enabled: "on" },
  ]) {
    assert.equal((await b.api("PUT", url, body)).status, 400, JSON.stringify(body));
  }
  const ok = await b.api("PUT", url, { enabled: true, channelId: text(G2, "400000000000000001"), staffRoleId: STAFF_ROLE(G2) });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json().applied, true);
  assert.deepEqual({ ...getSection(G2, "suggest") }, { enabled: true, channelId: text(G2, "400000000000000001"), staffRoleId: STAFF_ROLE(G2) });
  const channel = chanOf(G2, "400000000000000001");
  const real = channel.permissionsFor;
  channel.permissionsFor = () => ({ has: (flag) => flag !== "AddReactions" });
  try {
    const warn = await b.api("PUT", url, { enabled: true });
    assert.equal(warn.status, 200);
    assert.equal(warn.json().applied, false);
    assert.match(warn.json().notice, /Thêm biểu cảm/);
  } finally {
    channel.permissionsFor = real;
  }
  assert.equal((await b.api("PUT", url, { enabled: false })).json().applied, true);
});

test("security settings take the account age rule with strict values", async () => {
  const b = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/security");
  for (const body of [{ minAccountAgeDays: -1 }, { minAccountAgeDays: 366 }, { minAccountAgeDays: 1.5 }, { minAccountAgeDays: "7" }, { youngAction: "ban" }, { youngAction: 1 }]) {
    assert.equal((await b.api("PUT", url, body)).status, 400, JSON.stringify(body));
  }
  const ok = await b.api("PUT", url, { minAccountAgeDays: 7, youngAction: "kick" });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(getSection(G1, "security").minAccountAgeDays, 7);
  assert.equal(getSection(G1, "security").youngAction, "kick");
  assert.equal(getSection(G1, "security").lockdown.active, false);
  assert.equal((await b.api("PUT", url, { minAccountAgeDays: 0, youngAction: "alert" })).status, 200);
});

test("custom blocked words are cleaned, capped by the plan, shown with their limit, and sync AutoMod when it is on", async () => {
  const free = await loggedIn("admin");
  const url = guildUrl(G1, "/settings/automod");
  const view = (await free.req("GET", guildUrl(G1))).json();
  assert.equal(view.plan.limits.customWords, 20);
  assert.deepEqual(view.settings.automod.customWords, []);
  for (const body of [
    { customWords: "badword" },
    { customWords: [1] },
    { customWords: [null] },
    { customWords: [""] },
    { customWords: ["   "] },
    { customWords: ["***"] },
    { customWords: ["x".repeat(61)] },
    { customWords: ["x".repeat(500)] },
    { customWords: Array.from({ length: 501 }, (_, i) => `w${i}`) },
    { customWords: [{ word: "x" }] },
  ]) {
    assert.equal((await free.api("PUT", url, body)).status, 400, JSON.stringify(body).slice(0, 100));
  }
  // the same words the slash command turns away
  for (const word of ["a", "<@123456789012345678>", "@everyone", "<script>alert(1)</script>", "discord.gg/abc", "một, hai"]) {
    assert.equal((await free.api("PUT", url, { customWords: [word] })).status, 400, word);
  }
  const ok = await free.api("PUT", url, { customWords: ["  Từ Cấm ", "từ cấm", "bad\nword", "<img onerror=alert(1)>", "ab*"] });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(getSection(G1, "automod").customWords, ["từ cấm", "bad word", "<img onerror=alert(1)>", "ab*"], "lower-cased, trimmed, one line, duplicates merged");

  const twenty = Array.from({ length: 20 }, (_, i) => `tu${i}`);
  assert.equal((await free.api("PUT", url, { customWords: twenty })).status, 200);
  const over = await free.api("PUT", url, { customWords: [...twenty, "tu20"] });
  assert.equal(over.status, 403);
  assert.match(over.json().error, /20 từ khoá tự chế/);
  assert.equal(getSection(G1, "automod").customWords.length, 20);
  // after a downgrade the list may shrink or stay, never grow
  setSection(G1, "automod", { ...getSection(G1, "automod"), customWords: Array.from({ length: 25 }, (_, i) => `cu${i}`) });
  assert.equal((await free.api("PUT", url, { customWords: Array.from({ length: 24 }, (_, i) => `cu${i}`) })).status, 200);
  assert.equal((await free.api("PUT", url, { customWords: Array.from({ length: 25 }, (_, i) => `cu${i}`) })).status, 403);
  assert.equal((await free.api("PUT", url, { customWords: [] })).status, 200);

  // the Pro server has room for 200 and its words ride along with the AutoMod sync
  const pro = await loggedIn("admin");
  const urlPro = guildUrl(G2, "/settings/automod");
  assert.equal((await pro.api("PUT", urlPro, { customWords: Array.from({ length: 200 }, (_, i) => `p${i}`) })).status, 200);
  assert.equal((await pro.api("PUT", urlPro, { customWords: Array.from({ length: 201 }, (_, i) => `p${i}`) })).status, 403);
  const synced = await pro.api("PUT", urlPro, { enabled: true, level: "nhe", customWords: ["keyword"], logChannelId: text(G2, "400000000000000005") });
  assert.equal(synced.status, 200, synced.text);
  assert.deepEqual(getSection(G2, "automod").customWords, ["keyword"]);
  assert.equal(typeof synced.json().notice, "string");
  assert.ok(Object.keys(synced.json().value.ruleIds).length >= 0);
});

test("the overview counts the new things and leaves out anything personal", async () => {
  const b = await loggedIn("admin");
  const db = getDb();
  db.prepare("INSERT INTO scheduled_messages (guild_id, channel_id, body, weekday, hhmm, next_at, status, created_by, created_at) VALUES (?, ?, 'x', NULL, '09:00', 1, 'active', ?, 1)").run(G2, text(G2, "400000000000000001"), ADMIN);
  db.prepare("INSERT INTO reminders (guild_id, user_id, channel_id, body, due_at, status, created_at) VALUES (?, ?, NULL, 'bí mật', 1, 'pending', 1)").run(G2, PLAIN);
  db.prepare("INSERT INTO suggestions (guild_id, channel_id, user_id, body, status, created_at) VALUES (?, ?, ?, 'ý kiến', 'open', 1)").run(G2, text(G2, "400000000000000001"), PLAIN);
  db.prepare("INSERT INTO temp_voice (channel_id, guild_id, owner_id, created_at) VALUES (?, ?, ?, 1)").run(voiceId(G2, 1), G2, PLAIN);
  const res = await b.req("GET", guildUrl(G2));
  const counts = res.json().overview.counts;
  assert.deepEqual(Object.keys(counts).sort(), ["giveawaysOpen", "roleMenus", "scheduledMessages", "suggestionsOpen", "tempLobbies", "tempRooms"]);
  assert.equal(counts.scheduledMessages, 1);
  assert.equal(counts.suggestionsOpen, 1);
  assert.equal(counts.tempRooms, 1);
  assert.equal(counts.tempLobbies, getSection(G2, "tempvoice").lobbyChannelIds.length);
  assert.equal(counts.giveawaysOpen, giveawayStore.countActive(G2));
  assert.ok(!/bí mật|ý kiến|reminder/i.test(res.text), "no reminder or suggestion text leaves the server");
  // another server's rows are not counted
  assert.equal((await b.req("GET", guildUrl(G1))).json().overview.counts.suggestionsOpen, 0);
});

test("the new dashboard views draw everything through text nodes and send only whitelisted fields", () => {
  const read = (name) => readFileSync(path.join(here, "..", "dashboard", "views", name), "utf8");
  for (const name of ["giveaways.js", "rolemenus.js", "voice.js", "suggest.js", "automod.js", "security.js", "overview.js"]) {
    const code = read(name);
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, name);
  }
  assert.match(read("giveaways.js"), /text: g\.prize|h\("span", \{ text: g\.prize \}\)/);
  assert.match(read("rolemenus.js"), /h\("span", \{ text: menu\.title \}\)/);
  const tabs = readFileSync(path.join(here, "..", "dashboard", "views", "guild.js"), "utf8");
  for (const id of ["giveaway", "menu-role", "phong-thoai", "gop-y"]) assert.ok(tabs.includes(`id: "${id}"`), id);
});
