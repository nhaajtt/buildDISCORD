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
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_by TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  close_reason TEXT
);
CREATE INDEX IF NOT EXISTS tickets_guild ON tickets (guild_id, status);
CREATE TABLE IF NOT EXISTS audit_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  report TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_guild ON audit_reports (guild_id, created_at DESC);
CREATE TABLE IF NOT EXISTS events_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_kind ON events_log (kind, at);
CREATE INDEX IF NOT EXISTS events_guild ON events_log (guild_id, kind, at);
CREATE TABLE IF NOT EXISTS xp (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  msgs INTEGER NOT NULL DEFAULT 0,
  voice_min INTEGER NOT NULL DEFAULT 0,
  day TEXT,
  day_xp INTEGER NOT NULL DEFAULT 0,
  last_msg_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS xp_rank ON xp (guild_id, xp DESC);
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  host_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL DEFAULT 1,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  winner_ids TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS giveaways_due ON giveaways (status, ends_at);
CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  ends_at INTEGER,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS polls_due ON polls (status, ends_at);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS mod_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  until INTEGER,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mod_cases_user ON mod_cases (guild_id, user_id, at DESC);
CREATE TABLE IF NOT EXISTS role_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  roles TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS role_menus_guild ON role_menus (guild_id);
CREATE TABLE IF NOT EXISTS temp_voice (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS temp_voice_guild ON temp_voice (guild_id);
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL,
  weekday INTEGER,
  hhmm TEXT NOT NULL,
  next_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled_messages (status, next_at);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  user_id TEXT NOT NULL,
  channel_id TEXT,
  body TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (status, due_at);
CREATE INDEX IF NOT EXISTS reminders_user ON reminders (user_id, status);
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_by TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS suggestions_guild ON suggestions (guild_id, status);
CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (suggestion_id, user_id)
);
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
  // Columns added after the first release, for databases that already exist. 'payos' is what every earlier order used.
  const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!orderColumns.includes("provider")) db.exec("ALTER TABLE orders ADD COLUMN provider TEXT NOT NULL DEFAULT 'payos'");
  if (!orderColumns.includes("provider_ref")) db.exec("ALTER TABLE orders ADD COLUMN provider_ref TEXT");
  migrateJson(db);
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}
