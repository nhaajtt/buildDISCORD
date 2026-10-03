import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getDb } from "./db.js";

const KEEP = 7;

// Writes a consistent copy of the database to data/backups and prunes old copies. Returns the new file path, or null if today's copy already exists.
export function backupDb(now = new Date()) {
  const dir = path.join(config.dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `thauxaydung-${now.toISOString().slice(0, 10)}.db`);
  if (readdirSync(dir).includes(path.basename(file))) return null;

  // VACUUM INTO takes a quoted path, so any quote in it has to be doubled
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  const old = readdirSync(dir)
    .filter((f) => /^thauxaydung-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -KEEP);
  for (const f of old) unlinkSync(path.join(dir, f));
  return file;
}
