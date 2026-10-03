import { createLicense, listLicenses, revoke, grant } from "../src/license.js";

const [cmd, ...args] = process.argv.slice(2);
const parseDays = (value) => Number.parseInt(String(value).replace(/d$/i, ""), 10);

function usage() {
  console.log(`Usage:
  npm run license -- new <pro|plus> <days>         make a one-time activation code
  npm run license -- grant <guildId> <plan> <days>  give a server a plan directly
  npm run license -- revoke <guildId>              end a server's paid plan now
  npm run license -- list                          show every code and who redeemed it`);
}

try {
  if (cmd === "new" && args.length === 2) {
    console.log(createLicense(args[0], parseDays(args[1])));
  } else if (cmd === "grant" && args.length === 3) {
    const result = grant(args[0], args[1], parseDays(args[2]));
    console.log(`Granted ${result.plan} until ${new Date(result.expiresAt).toISOString()}`);
  } else if (cmd === "revoke" && args.length === 1) {
    console.log(`Ended ${revoke(args[0])} license(s).`);
  } else if (cmd === "list") {
    for (const l of listLicenses()) {
      const state = l.guild_id ? `server ${l.guild_id}, until ${new Date(l.expires_at).toISOString().slice(0, 10)}` : "unused";
      console.log(`${l.code}  ${l.plan}  ${l.days}d  ${state}`);
    }
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
