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
