# buildDISCORD

[![CI](https://github.com/nhaajtt/buildDISCORD/actions/workflows/ci.yml/badge.svg)](https://github.com/nhaajtt/buildDISCORD/actions/workflows/ci.yml)

A Discord bot nicknamed **Thầu Xây Dựng** ("the contractor"). Invite it to an empty server, run `/build`, and a few minutes later the server has categories, text and voice channels, roles, rules, a welcome message and a role picker. All of it written in Vietnamese meme humor.

Website: https://builddiscord.vercel.app (Vietnamese and English).

Made by [nhaajt](https://github.com/nhaajtt) ([website](https://www.nhaajt.com/), [Instagram](https://www.instagram.com/nhaajt_hehee/)). The story of how it was built, including what went wrong, is in [docs/devlog.md](docs/devlog.md). It is a sibling of [musiDISCORD](https://github.com/nhaajtt/musiDISCORD) and [companionsDISCORD](https://github.com/nhaajtt/companionsDISCORD), and runs next to them on the same Raspberry Pi.

**Status: working, still growing.** What exists is listed below. What is planned is under [Roadmap](#roadmap).

## What it does

- **`/build`** builds a whole server from one theme, or from up to four mixed themes (study, games and chill in one server). Eleven themes ship in the box: late-night gamers, studying without studying, a general-store community, chill with the crew, **book a friend** (a server where people book someone to play a game with or talk to), anime fans, coders, content creators, cinema and music, an office team, and pet lovers.
- **`/thietke`** takes a short description of your group ("eight friends, Valorant on Saturdays, lots of chatting") and asks Google Gemini to design the server. You pick how funny it should be: gentle, troll or absurd.
- **A blueprint you can edit.** Both commands show a tree of everything before anything is built. Remove a category, rename one, add a channel, then confirm. Nothing is created without a click.
- **Safe to run twice.** Existing channels and roles with the same name are skipped, and rules and the welcome message are not posted again.
- **`/nuke`** removes only what the bot created, after a confirmation. It never touches anything else.
- **Role picker** with buttons, limited to the roles the bot itself recorded, so a forged button cannot hand out other roles.
- **Music and text-to-speech rooms.** Discord does not let a bot add another bot, so the bot builds a DJ booth and a text-to-speech channel and posts an invite button for the bots you configure. An admin clicks once.
- **Plans per server.** A free plan (one theme, one build) and paid plans activated with a one-time code. See [Plans](#plans).
- **`/roast`** gently roasts a member, because every server needs one.

The bot never reads message content and does not use any privileged intent.

## Commands

| Command | Who | What it does |
| --- | --- | --- |
| `/build theme [theme2..theme4]` | Administrators | Shows a blueprint for one or more mixed themes, then builds it |
| `/thietke mota [muc-do-hai]` | Administrators, Pro plan | AI designs the server from a description |
| `/nuke` | Administrators | Removes what the bot built, after confirmation |
| `/kichhoat ma` | Administrators | Activates a plan with a code |
| `/goi` | Everyone | Shows the server's plan and how to upgrade |
| `/xoadulieu` | Administrators | Makes the bot forget what it built (channels and roles on Discord stay) |
| `/roast nguoi` | Everyone | A gentle roast |
| `/admin taoma, cap, thuhoi, thongke` | Bot owner only | Make codes, grant or revoke plans, see how many servers use each plan |

## Plans

| | Free | Pro | Plus |
| --- | --- | --- | --- |
| Themes per build | 1 | up to 4 mixed | up to 4 mixed |
| Builds | 1 in total | unlimited | unlimited |
| AI designs per month | 0 | 20 | 100 |
| Price per server | $0 | $9.99 / 30 days | $19.99 / 30 days |

Payment is manual for now: customers message the owner on Instagram and pay by transfer. The owner makes a code with `npm run license -- new pro 30d` (or `/admin taoma`), the customer runs `/kichhoat`, and the plan ends by itself when the days run out. Codes are single use, and a second code of the same plan adds its days after the current expiry.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), add a Bot and copy the token and the Application ID. No privileged intent is needed.
2. Invite the bot with this link (replace `CLIENT_ID`). Administrator is the easy choice, because the bot manages channels, roles and the server and posts into read-only channels:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=8`
3. Copy `.env.example` to `.env` and fill it in (see [Configuration](#configuration)).
4. Install and run:
   ```bash
   npm install
   npm run deploy-commands   # registers the slash commands
   npm start
   ```

Node 22.13 or newer is required, because the bot uses the SQLite module built into Node.

### On a Raspberry Pi (or any Debian box)

```bash
curl -fsSL https://raw.githubusercontent.com/nhaajtt/buildDISCORD/main/scripts/install-pi.sh | sh
```

The installer installs Docker and git, fetches the project into `~/buildDISCORD`, asks for the token and the Application ID, starts the container and optionally installs a daily self-update timer. It never overwrites an existing `.env` and is safe to run again. It shares nothing with musiDISCORD or companionsDISCORD at runtime, so all three can run on one machine.

To install the daily self-update by hand later (it needs sudo):

```bash
cd ~/buildDISCORD
for ext in service timer; do sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" deploy/pi/thauxaydung-update.$ext | sudo tee /etc/systemd/system/thauxaydung-update.$ext >/dev/null; done
sudo systemctl daemon-reload && sudo systemctl enable --now thauxaydung-update.timer
```

The update script fetches new commits, accepts fast-forwards only, rebuilds, waits for the container's health check to pass and rolls back to the previous version if it does not.

## Configuration

| Variable | Needed | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID |
| `GUILD_ID` | no | Register commands on one server only (instant). Empty means global, which can take a while to appear |
| `OWNER_IDS` | no | Comma separated Discord user IDs allowed to use `/admin` |
| `MUSIC_BOT_INVITE_URL`, `TTS_BOT_INVITE_URL` | no | Invite links behind the buttons in the DJ and text-to-speech channels |
| `GEMINI_API_KEY` | no | Key from [Google AI Studio](https://aistudio.google.com/apikey). Without it `/thietke` stays off |
| `GEMINI_MODEL` | no | Force a model name. Empty means the bot picks the newest stable flash model your key can use |
| `CONTACT_TEXT` | no | Shown by `/goi`: how a customer buys a code |
| `ALERT_WEBHOOK_URL` | no | Discord webhook that receives errors and a "started" message |
| `DATA_DIR` | no | Where the database lives (default `data`) |
| `BUILD_STEP_DELAY_MS` | no | Pause after each created channel or role, default 350 (tests use 0) |

## What is stored

For each server: its ID, the theme used, the IDs of the channels, categories and roles the bot created, the active license (plan and expiry) and how many times some features were used. For `/thietke`, the description you type is sent to Google Gemini; on Google's free tier Google may use it to improve its products, so do not put anything private in it. Message content is never read or stored. `/xoadulieu` erases a server's record.

The database is `data/thauxaydung.db` (SQLite). A consistent copy is written to `data/backups` once a day and the last seven are kept.

## Project layout

```
src/
  index.js, config.js, db.js, store.js, license.js, builder.js
  commands/      one file per slash command
  events/        ready, interactionCreate, guildCreate
  themes/        shared parts + the eleven themes, and the merge into one plan
  ai/            Gemini client, the designer prompt, and the validator that cleans its answer
  ui/editor.js   blueprint view and its buttons, menus and modals
  blueprints.js  the plan being edited (in memory, 15 minutes)
  humor/         every line the bot says
scripts/         license CLI, Raspberry Pi installer and updater
deploy/pi/       systemd unit and timer for the daily update
web/             the website (Next.js), Vietnamese and English: landing page, AI designer and editor sections, plans, commands, FAQ, devlog, privacy and terms
test/            node --test
```

More in [docs/architecture.md](docs/architecture.md).

## Development

```bash
npm test                         # all tests, no Discord and no network needed
node scripts/license.js          # prints the license CLI usage
cd web && npm install && npm run dev
```

The builder, licenses, blueprint editing, validator and Gemini client are plain modules tested with a fake Discord server and a fake `fetch`. Only `src/index.js` and the event files touch the real Discord gateway.

## Engineering highlights

- **Idempotent builds and safe undo.** Creation reports whether it made anything, so a second `/build` creates and posts nothing twice, and `/nuke` deletes only recorded IDs: `src/builder.js`.
- **Defence against forged interactions.** Every select, modal and button re-checks the guild, the person and the administrator permission, and role buttons only grant recorded roles: `src/ui/editor.js`, `src/events/interactionCreate.js`.
- **An LLM treated as untrusted input.** Schema-constrained output, a sanitiser, a per-minute bot-wide limit, a per-server monthly quota, a typed error taxonomy and retries: `src/ai/gemini.js`, `src/ai/validate.js`, `src/ai/designer.js`.
- **Licensing without a payment gateway.** Single-use codes over an unambiguous alphabet, plans derived from licenses so nothing needs to expire, and every rule tested with an injected clock: `src/license.js`, `src/utils/gate.js`.
- **Storage that grew with the product.** A move from JSON files to the SQLite module built into Node with an automatic, non-destructive import, WAL mode and daily `VACUUM INTO` copies: `src/db.js`, `src/backup.js`.
- **Operations you can leave alone.** A heartbeat-based Docker health check, alerts that cannot flood a channel, graceful shutdown, and a self-update that rolls back unless the new version becomes healthy: `src/healthcheck.js`, `src/alerts.js`, `scripts/update.sh`.
- **Testing without the network.** A fake guild, a stubbed `fetch` and injectable time keep the suite independent of Discord and Google: `test/builder.test.js`, `test/ai.test.js`, `test/license.test.js`.
- **A website that cannot drift from the bot.** The theme data shown on the site is generated from the bot's own code and checked by a test: `scripts/export-web-data.js`, `test/webdata.test.js`.

**Numbers:** about 1,850 lines of bot code in 35 files, 40 tests in 5 files that run in about 3 seconds, 8 slash commands, 3 database tables, 2 runtime dependencies, a 186 MB arm64 Docker image, and 11 themes that combine into 561 plans (any mix of up to four) of up to 22 roles, 13 categories and 54 channels. The full story, including what is still missing, is in [docs/devlog.md](docs/devlog.md).

## Roadmap

- Humor level for the built-in themes, and saving a blueprint as your own theme
- Backup and restore of a server layout
- Mini-games, levels and scheduled events to keep a server alive after it is built
- Automatic payments (activation codes are made by hand for now)

## Privacy and terms

Plain-language pages are on the website: `/privacy` and `/terms`, in Vietnamese and English.
