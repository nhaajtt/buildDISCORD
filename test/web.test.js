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
      const m = { id: nextId(), payload, edits: [], edit: async (p) => void m.edits.push(p) };
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
grantAccess(G2, ADMIN, P.ManageGuild);
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
      { id: G2, name: "x", owner: false, permissions: "32" },
      { id: G3, name: "x", owner: false, permissions: "8" },
      { id: G4, name: "x", owner: true, permissions: "8" },
      { id: G5, name: "x", owner: false, permissions: "2048" },
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
    const req = http.request({ host: "127.0.0.1", port: p, method, path: target, headers }, (res) => {
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
  assert.equal(g.plan.limits.buildsTotal, 1);
  assert.equal(g.usage.builds, 0);
  assert.deepEqual(Object.keys(g.settings).sort(), ["automod", "tickets", "welcome"]);
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
  assert.deepEqual(Object.keys(orders[0]).sort(), ["amount", "code", "createdAt", "days", "paidAt", "plan", "status"]);
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
