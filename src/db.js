import { mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

let db = null;

const schema = `
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  record TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS licenses (
  code TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  days INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  guild_id TEXT,
  redeemed_at INTEGER,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS licenses_guild ON licenses (guild_id);
CREATE TABLE IF NOT EXISTS usage (
  guild_id TEXT NOT NULL,
  month TEXT NOT NULL,
  feature TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, month, feature)
);
CREATE TABLE IF NOT EXISTS custom_themes (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, name)
);
CREATE TABLE IF NOT EXISTS scores (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_checkin TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (guild_id, points DESC);
CREATE TABLE IF NOT EXISTS recurring_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  weekday INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  duration_min INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  notify_role_id TEXT,
  last_event_start INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recurring_guild ON recurring_events (guild_id);
CREATE TABLE IF NOT EXISTS orders (
  order_code INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT,
  plan TEXT NOT NULL,
  days INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  checkout_url TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_status ON orders (status);
`;

// Imports the per-server JSON files written by the first version, then sets them aside
function migrateJson(handle) {
  let files = [];
  try {
    files = readdirSync(config.dataDir).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return;
  }
  const insert = handle.prepare("INSERT OR IGNORE INTO guilds (id, record, updated_at) VALUES (?, ?, ?)");
  for (const file of files) {
    const full = path.join(config.dataDir, file);
    try {
      insert.run(file.replace(".json", ""), JSON.stringify(JSON.parse(readFileSync(full, "utf8"))), Date.now());
      renameSync(full, `${full}.migrated`);
    } catch (error) {
      console.error(`Could not migrate ${file}:`, error.message);
    }
  }
}

export function getDb() {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, "thauxaydung.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(schema);
  migrateJson(db);
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}
