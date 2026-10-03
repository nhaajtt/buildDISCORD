import { readFileSync } from "node:fs";
import path from "node:path";

// Docker runs this: healthy only if the bot wrote its heartbeat in the last 90 seconds
const file = path.join(process.env.DATA_DIR || "data", "heartbeat");
try {
  const age = Date.now() - Number(readFileSync(file, "utf8"));
  process.exit(age < 90_000 ? 0 : 1);
} catch {
  process.exit(1);
}
