import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Collection } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "build-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";
const { buildServer, nukeServer } = await import("../src/builder.js");
const { loadRecord } = await import("../src/store.js");
const { buildPlan, countPlan } = await import("../src/themes/index.js");

let nextId = 1;
const id = () => String(nextId++);

function fakeGuild() {
  const roles = new Collection();
  const channels = new Collection();
  const sent = [];
  const attach = (collection, item) => {
    item.delete = async () => collection.delete(item.id);
    collection.set(item.id, item);
    return item;
  };
  roles.everyone = { id: "everyone" };
  return {
    id: "g1",
    roles: {
      cache: roles,
      everyone: roles.everyone,
      create: async (o) => attach(roles, { id: id(), ...o }),
      fetch: async (rid) => roles.get(rid) ?? null,
    },
    channels: {
      cache: channels,
      create: async (o) => {
        const channel = { id: id(), ...o, parentId: o.parent ?? null };
        if (o.type !== 4) channel.name = String(o.name).toLowerCase().replace(/ /g, "-");
        if (o.type === 2) channel.name = o.name;
        channel.send = async (message) => sent.push({ channel: channel.name, message });
        return attach(channels, channel);
      },
      fetch: async (cid) => channels.get(cid) ?? null,
    },
    setSystemChannel: async () => {},
    sent,
  };
}

test("build creates everything once and is idempotent", async () => {
  const guild = fakeGuild();
  const plan = buildPlan("gaming");
  const counts = countPlan(plan);

  await buildServer(guild, "gaming");
  assert.equal(guild.roles.cache.size, counts.roles);
  assert.equal(guild.channels.cache.size, counts.channels + counts.categories);
  const firstPosts = guild.sent.length;
  assert.ok(firstPosts >= 5);

  await buildServer(guild, "gaming");
  assert.equal(guild.roles.cache.size, counts.roles);
  assert.equal(guild.channels.cache.size, counts.channels + counts.categories);
  assert.equal(guild.sent.length, firstPosts, "re-run must not repost content");
  assert.ok(loadRecord("g1").pickRoles.length > 0);
});

test("nuke removes what was built", async () => {
  const guild = fakeGuild();
  await buildServer(guild, "hoc-tap");
  const removed = await nukeServer(guild);
  assert.ok(removed > 0);
  assert.equal(guild.roles.cache.size, 0);
  assert.equal(guild.channels.cache.size, 0);
  assert.equal(loadRecord("g1").roles.length, 0);
});

test("a build that fails halfway still records what it created, so nuke can clean it up", async () => {
  const guild = fakeGuild();
  guild.id = "g-partial";
  const create = guild.channels.create;
  let calls = 0;
  guild.channels.create = async (options) => {
    if (++calls === 6) throw new Error("Discord said no");
    return create(options);
  };

  await assert.rejects(buildServer(guild, "gaming"), /Discord said no/);
  const record = loadRecord("g-partial");
  assert.ok(record.roles.length > 0, "roles created before the failure are recorded");
  assert.equal(record.channels.length + record.categories.length, 5, "everything created before the failing call is recorded");

  const removed = await nukeServer(guild);
  assert.equal(removed, record.roles.length + 5);
  assert.equal(guild.roles.cache.size, 0);
  assert.equal(guild.channels.cache.size, 0);
});
