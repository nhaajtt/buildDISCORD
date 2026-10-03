# buildDISCORD

[![CI](https://github.com/nhaajtt/buildDISCORD/actions/workflows/ci.yml/badge.svg)](https://github.com/nhaajtt/buildDISCORD/actions/workflows/ci.yml)
[![Website](https://img.shields.io/badge/website-builddiscord.vercel.app-0b2b6f)](https://builddiscord.vercel.app)

![A drafting table that shows what the bot builds for any mix of themes](docs/img/hero.webp)

A Discord bot nicknamed **Thầu Xây Dựng** ("the contractor"). Invite it to an empty server, press the Start button it posts (or run `/batdau`), pick a few options, and a few minutes later the server has categories, text and voice channels, roles, rules, a welcome message and a role picker, all written in Vietnamese meme humor, with its protection already switched on. Then it keeps the server safe and alive: anti-raid, moderation with case history, activity levels, giveaways, polls, a weekly report, mini-games, recurring events, backups and your own saved themes.

Website: https://builddiscord.vercel.app (Vietnamese and English), with live demos of the theme merge, the AI designer and the blueprint editor, a page for each theme with its full channel tree, and a status page that reads the bot's public `/status` route in the browser.

Made by [nhaajt](https://github.com/nhaajtt) ([website](https://www.nhaajt.com/), [Instagram](https://www.instagram.com/nhaajt_hehee/)). The story of how it was built, including what went wrong, is in [docs/devlog.md](docs/devlog.md). It is a sibling of [musiDISCORD](https://github.com/nhaajtt/musiDISCORD) and [companionsDISCORD](https://github.com/nhaajtt/companionsDISCORD), and runs next to them on the same Raspberry Pi.

**Status: version 1.6 and running in production.** What is next is under [Roadmap](#roadmap). What changed is in [CHANGELOG.md](CHANGELOG.md).

## What it does

**Build a server**
- **`/batdau`, the guided setup.** One screen with three menus (what kind of server, which humor level, which extras to switch on) and one button. It reads the server's health score, builds, switches on the chosen protection, reads the score again and posts a card to show off. The bot also posts a Start button in a channel when it joins a server, so a new customer never has to know a command name. "Suggest for me" picks a theme from a few typed words with a keyword table, without an AI call.
- **`/trogiup`.** The command list grouped by purpose, with what the server's plan locks marked.
- **`/build`** builds a whole server from one theme, or from up to four mixed themes. Eleven themes ship in the box: late-night gamers, studying without studying, a general-store community, chill with the crew, **book a friend** (a server where people book someone to play a game with or talk to), anime fans, coders, content creators, cinema and music, an office team, and pet lovers.
- **Three humor levels** (gentle, troll, absurd) change the words of the shared rules and the welcome, never the structure, so rebuilding at another level duplicates nothing.
- **`/thietke`** takes a short description of your group and asks Google Gemini to design the server.
- **A blueprint you can edit.** Every build shows a tree first. Remove a category, rename one, add a channel, save it as your own theme, then confirm. Nothing is created without a click.
- **Safe to run twice, and safe to undo.** Existing things are skipped, content is not posted twice, and `/nuke` deletes only what the bot recorded.

**Keep it alive**
- **Your own themes.** Save a blueprint as a theme, reuse it, export it to a file or import one from a friend. A saved theme can never carry permissions.
- **Backup and restore.** Snapshot roles, channels and permissions. Restore only creates what is missing, deletes nothing, and never grants Administrator. A snapshot from another server also loses its other powerful permissions.
- **Check-in, levels and mini-games.** A daily check-in with streaks, level roles, a leaderboard, guess the number, rock paper scissors duels and quick trivia.
- **Recurring events.** Weekly Discord events created and announced by the bot.

**Look after the server**
- **Welcome flow.** `/chaomung` greets new members (the bot reads Discord's own join notice, so no privileged intent), can hand out a starter role and add a verify button.
- **Health check.** `/khamsuckhoe` scores the server on permissions, channels and security, explains each finding and offers safe one-click fixes. Nothing changes without a click.
- **AutoMod.** `/automod` builds Discord's native rules (spam, invite links, mention floods, and more at higher levels) so Discord does the blocking and the bot never reads messages.
- **Tickets.** `/ticket` posts a panel; each ticket is a private channel for the member and the staff role, closed automatically after a quiet spell, with no transcripts kept.
- **Anti-raid and lockdown.** `/khoakhan caidat` counts joins from Discord's own join notice. When more than N people arrive within a number of seconds it alerts the staff channel and, depending on the setting, only alerts, raises the verification level one step, or locks the text channels for @everyone. Every lockdown records exactly what it changed and is lifted automatically after a chosen number of minutes (or by `/khoakhan tat` or the Unlock button on the alert). `/khoakhan bat` locks by hand.
- **Anti-nuke guard (Pro).** Counts channel and role deletions per person from the audit log. On a burst it alerts and takes the dangerous roles (Administrator, Manage Server, Manage Roles and so on) from the culprit, never from the owner, a managed role or anyone at or above the bot.
- **Mod log.** `/khoakhan nhatky` writes bans, unbans, timeouts made through the bot, role permission changes and AutoMod blocks (never the blocked text) to a channel.
- **Moderation with history.** `/canhcao`, `/timeout`, `/kick` and `/ban` check both people's role positions before doing anything, send the member a private notice, store a numbered case and log it. `/hoso` shows a member's last ten cases.
- **Weekly report and health check.** A digest of numbers only (joins, tickets, AutoMod blocks, health score against last week, up to three suggestions with a fix button), plus a weekly health check that alerts when the score falls by ten points or more.
- **Expiry reminders.** One notice three days before a paid plan ends and one after it ends, each sent once per expiry.
- **Web dashboard.** Server admins sign in with Discord and manage all of the above in a browser. See [Dashboard](#dashboard).

**Engage members**
- **Activity levels.** Xp for chatting (only who wrote and where, never the text) and for time in voice rooms (not deafened, not in the AFK room, at least one other listener), with a cooldown and a daily cap. `/hang xem` shows level and rank; `/hang caidat` tunes it. Pro.
- **Role menus.** `/vaitro` posts buttons (or a select menu above five roles) for members to take and drop roles, in pick-one or pick-many mode. Every press is checked again against the live role. 3 menus free, 10 on Pro, 25 on Plus.
- **Giveaways and polls.** `/quatang` runs a giveaway with a Join button, an optional required role and several winners, drawn automatically when the time is up, with reroll (Pro). `/binhchon` runs an anonymous button poll that updates in place and closes by timer or by button.
- **AI writing helper.** `/vietgiup` drafts rules, a welcome, an announcement, or a plain-words explanation of the last health check. It only drafts; the admin posts it (Pro).

**Run it as a business**
- **Plans per server** (free, Pro, Plus) with limits for everything above. See [Plans](#plans).
- **Funnel.** `/admin thongke` shows how many servers reached each step in the last 30 days: invited, finished the setup, built, tried Pro, paid. Only the server ID, a short kind and the time are stored.
- **Public status.** The bot answers `GET /status` on the dashboard port with its version, uptime, a rounded server count and whether its heartbeat is fresh. The website's status page reads it from the browser.
- **Automatic payments.** `/mua` creates a Stripe Checkout link (card, in dollars) or a payOS link (Vietnamese bank QR code, in dong); the bot polls its own open orders and switches the plan on when the money arrives. Activation codes still work for buying by hand.

The bot never reads message content and uses no privileged intent. It listens to the intents Guilds, GuildMessages (who wrote and where, never the text), GuildVoiceStates, GuildModeration and AutoModerationExecution, and none of them is privileged. Discord does not let a bot add another bot, so the music and text-to-speech rooms come with an invite button for the bots you configure.

## Screenshots

| | |
| --- | --- |
| ![The AI designer with three real answers](docs/img/ai-designer.webp) | ![The working miniature of the blueprint editor](docs/img/blueprint-editor.webp) |
| ![What happens after the build](docs/img/features.webp) | ![The plans](docs/img/pricing.webp) |

## Commands

| Command | Who | What it does |
| --- | --- | --- |
| `/batdau` | Administrators | Guided setup: kind of server, humor level and extras, then one button builds and configures |
| `/trogiup` | Everyone | The command list by group, locked items marked, and the handbook link |
| `/build theme [theme2..theme4] [muc-do-hai]` | Administrators | Blueprint for one or more mixed themes at a humor level, then build |
| `/thietke mota [muc-do-hai]` | Administrators, Pro | AI designs the server from a description |
| `/vietgiup luat, loichao, thongbao, giaithich` | Administrators, Pro | AI drafts rules, a welcome, an announcement, or explains the health check |
| `/theme danhsach, dung, xoa, xuat, nhap` | Administrators, Pro | Reuse, delete, export and import saved themes |
| `/backup tao, khoiphuc, danhsach, xoa, xuat, nhap` | Administrators, Pro | Back up the layout and restore what is missing |
| `/sukien tao, danhsach, xoa, mau` | Administrators, Pro | Weekly recurring events |
| `/diemdanh`, `/bangxephang` | Everyone, Pro server | Daily check-in and the leaderboard |
| `/doanso`, `/thachdau`, `/cauhoi` | Everyone, Pro server | Guess the number, rock paper scissors, trivia |
| `/hang xem [nguoi]`, `/hang caidat` | Everyone, administrators for settings, Pro | Activity level and rank; xp per message, cooldown, daily cap, voice xp, level-up channel |
| `/vaitro tao, dang, danhsach, xoa` | Administrators | Role menus with buttons, pick one or many |
| `/quatang tao, huy, chonlai, danhsach` | Manage Server, Pro | Giveaways with a Join button and automatic draw |
| `/binhchon cauhoi lua1..lua5 [thoigian]` | Manage Messages | Anonymous button poll with up to five choices |
| `/chaomung caidat, thu, tat` | Administrators | Welcome message, starter role, verify button |
| `/khamsuckhoe kiemtra, lichsu` | Administrators | Health score with safe fixes, and recent scores |
| `/automod bat, tat, trangthai, mientru` | Administrators | Native AutoMod rules by level (Medium and Strict from Pro) |
| `/khoakhan bat, tat, trangthai, caidat, nhatky` | Administrators | Lockdown, anti-raid, anti-nuke (Pro) and the mod log |
| `/canhcao`, `/timeout`, `/kick`, `/ban` `nguoi lydo ...` | Moderate Members, Kick Members, Ban Members | Moderate a member, with hierarchy checks, a notice and a stored case |
| `/hoso nguoi` | Moderate Members | The last ten cases of a member |
| `/ticket caidat, loai, ...` | Administrators, Pro | Private support tickets |
| `/nuke` | Administrators | Removes what the bot built, after confirmation |
| `/mua goi [ngay] [cach]` | Administrators | Buy or renew a plan (or the one-off setup help), paid by card or bank QR |
| `/dungthu` | Administrators | Seven days of Pro, free, once per server |
| `/kichhoat ma` | Administrators | Activates a plan with a code |
| `/goi` | Everyone | The server's plan and how to upgrade |
| `/xoadulieu` | Administrators | Makes the bot forget everything it keeps about the server except billing records (channels and roles on Discord stay) |
| `/roast nguoi` | Everyone | A gentle roast |
| `/admin taoma, cap, thuhoi, thongke, donhang` | Bot owner only | Make codes, grant or revoke plans, plan counts and the 30 day funnel, recent orders |

## Plans

| | Free | Pro | Plus |
| --- | --- | --- | --- |
| Themes per build | 1 | up to 4 mixed | up to 4 mixed |
| Builds | 2 in total | unlimited | unlimited |
| Humor level | troll | any | any |
| Guided setup, health check, welcome, anti-raid, mod log, moderation commands, polls, weekly report | yes | yes | yes |
| AutoMod | gentle level | all levels, exemptions | all levels, exemptions |
| AI designs per month | 0 | 20 | 100 |
| AI writing helper (`/vietgiup`) | no | yes | yes |
| Backups | 0 | 3 | 10 |
| Saved themes | 0 | 3 | 10 |
| Recurring events | 0 | 3 | 10 |
| Tickets | no | yes | yes |
| Anti-nuke guard | no | yes | yes |
| Activity levels (`/hang`) | no | yes | yes |
| Giveaways | no | yes | yes |
| Role menus | 3 | 10 | 25 |
| Check-in, mini-games | no | yes | yes |
| Price per server | $0 | $3.99 / 30 days | $7.99 / 30 days |

A year costs ten months: Pro is $39.90 and Plus $79.90 for 365 days. The `ngay` option of `/mua` offers 30, 90, 180 and 365 days, priced per 30 days times the number of months. There is also a one-off **Dựng giúp** ("build it for me") for $4.99: it grants 7 days of Pro, enough to set a server up, without subscribing. `/dungthu` still gives each server one free 7 day Pro trial, and it cannot be repeated because the mark lives in the lifetime counters that `/xoadulieu` does not clear.

### Payments

`/mua goi:pro ngay:365` records an order, asks the gateway for a payment link and shows it with a Pay button. The `cach` option picks the gateway (Stripe by default when its key is set). Stripe charges the list price in dollars (a year is ten months); for payOS the amount in dong is the dollar price converted at `USD_VND_RATE`, rounded to a thousand. There is no public address for the gateways to call, so a job asks each gateway about the open orders every 30 seconds, and a Stripe session is only accepted when its order reference, amount and currency match the order; the order's status change from pending to paid is the guard that grants the plan exactly once, and the customer gets a message in the channel where they ran the command. The one-off `dungiup` option grants seven days of Pro. Orders expire after 35 minutes. Without the payOS keys `/mua` says how to buy by hand.

Buying by hand still works: the owner makes a code with `npm run license -- new pro 30d` (or `/admin taoma`), the customer runs `/kichhoat`, and the plan ends by itself when the days run out. Codes are single use, and a second code of the same plan adds its days after the current expiry.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), add a Bot and copy the token and the Application ID. No privileged intent is needed.
2. Invite the bot with this link (replace `CLIENT_ID`). Administrator is the easy choice, because the bot manages channels, roles, events and the server and posts into read-only channels:
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

The update script fetches new commits, accepts fast-forwards only, rebuilds, waits for the container's health check to pass and rolls back to the previous version if it does not. After an update that changes slash commands, run `docker compose run --rm bot node src/deploy-commands.js` once.

### The website

`web/` is a Next.js site deployed on Vercel from this repository: the project's root directory is `web`, a push to `main` deploys it, and a push that changes nothing under `web/` skips the build. Every page is static (theme pages come from `generateStaticParams`, with a `sitemap.xml`); the status page does its one fetch in the browser and says "không kiểm tra được" (cannot check) when the bot cannot be reached.

## Dashboard

The dashboard runs inside the bot process and is off until `DISCORD_CLIENT_SECRET`, `SESSION_SECRET` and `DASHBOARD_URL` are all set. Sign-in is Discord OAuth2; the access token is revoked right after the user is identified, and a server is only shown to people who are administrators of it right now (re-checked against Discord on every request). Sessions are signed cookies, writes need a CSRF header and a same-origin check, and the page runs under a strict content security policy.

The tabs are Overview (plan, usage, health, features, open tickets), Welcome, AutoMod, Tickets, Security (anti-raid, anti-nuke, lockdown state and an unlock button), Activity points, Weekly report (with a test send), Mod log, Activity (the numbers over time), Health check and Plan and payments.

The same port also answers a public `GET /status` with `ok`, `version`, `uptimeSec`, a server count rounded down to ten and the heartbeat age. It needs no login, allows any origin, is rate limited and carries no ID or name; the website's status page reads it.

1. In the Discord Developer Portal add the redirect `<DASHBOARD_URL>/auth/callback` and copy the client secret.
2. Put the three variables in `.env`. Generate the session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Compose publishes the port on the host's loopback only (`127.0.0.1:8788`). To reach it from outside without opening a router port, run `tailscale funnel --bg 8788` and use the resulting `https://<machine>.<tailnet>.ts.net` as `DASHBOARD_URL`.

## Configuration

| Variable | Needed | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID |
| `GUILD_ID` | no | Register commands on one server only (instant). Empty means global, which can take a while to appear |
| `OWNER_IDS` | no | Comma separated Discord user IDs allowed to use `/admin` |
| `MUSIC_BOT_INVITE_URL`, `TTS_BOT_INVITE_URL` | no | Invite links behind the buttons in the DJ and text-to-speech channels |
| `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DASHBOARD_URL` | no | All three switch the dashboard on |
| `DASHBOARD_PORT`, `DASHBOARD_HOST` | no | Port (default 8788) and bind address (default 127.0.0.1, compose sets 0.0.0.0 inside the container) |
| `UNLOCKED_GUILD_IDS` | no | Comma separated server IDs that get every feature with no license (your own and test servers) |
| `GEMINI_API_KEY` | no | Key from [Google AI Studio](https://aistudio.google.com/apikey). Without it `/thietke` stays off |
| `GEMINI_MODEL` | no | Force a model name. Empty means the bot picks the newest stable flash model your key can use |
| `STRIPE_SECRET_KEY` | no | Stripe secret or restricted key (`sk_...` or `rk_...`). Switches card payments on |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | no | payOS credentials. All three switch `/mua` on |
| `USD_VND_RATE` | no | Dong per dollar for the price charged (default 26000). Update it when the rate moves |
| `SITE_URL` | no | Where the gateway sends a customer after paying or cancelling |
| `TIMEZONE` | no | Time zone for check-in days and recurring events (default `Asia/Ho_Chi_Minh`) |
| `CONTACT_TEXT` | no | Shown by `/goi`: how a customer buys by hand |
| `ALERT_WEBHOOK_URL` | no | Discord webhook that receives errors and a "started" message |
| `DATA_DIR` | no | Where the database lives (default `data`) |
| `BUILD_STEP_DELAY_MS` | no | Pause after each created channel or role, default 350 (tests use 0) |

## What is stored

For each server: its ID, its welcome, AutoMod, ticket, security, activity, weekly report, mod log and setup settings, open tickets (channel and opener, never messages), health check scores, the theme used, the IDs of the channels, categories and roles the bot created, the active license (plan and expiry), usage counters, and, when the features are used, saved themes, backups (a copy of the layout, never message content), recurring event definitions and members' points, streaks and last check-in day. The newer features add, per member ID: activity xp, message count and voice minutes; moderation cases (member ID, moderator ID, action, the typed reason, time); giveaway entries; poll votes (the member ID and the chosen option, shown to nobody as a name); role menus (which roles a menu offers, never who took them); and security records (the lockdown state needed to put permissions back exactly). A small event log keeps only a server ID, a short kind (joined, setup finished, built, trial, paid, left) and a time, for the owner's funnel and the weekly report's join count. Payment orders keep the plan, days, amount, status and the Discord IDs of the server and the person who ran `/mua`. For `/thietke` and `/vietgiup`, the description you type is sent to Google Gemini; on Google's free tier Google may use it to improve its products, so do not put anything private in it. Message content is never read or stored, and no privileged intent is used. `/xoadulieu` erases a server's build record and settings; the per-member tables above are not touched by it yet, and are erased on request.

The database is `data/thauxaydung.db` (SQLite). A consistent copy is written to `data/backups` once a day and the last seven are kept.

## Project layout

```
src/
  index.js, config.js, db.js, store.js, license.js, builder.js, jobs.js
  commands/      one file per slash command
  events/        ready, interactionCreate, guildCreate and guildDelete, messages (join notices and xp), voice states, bans, role changes, AutoMod blocks, channel and role deletes
  jobs/          background jobs, one file each: payments, recurring events, tickets, health audit, weekly report, lockdown expiry, giveaways and polls, plan expiry reminders
  themes/        shared parts, the eleven themes, humor levels, saved themes, and the merge into one plan
  ai/            Gemini client, the designer prompt, the writing helper, and the validator that cleans its answer
  backups/       snapshot, validation, restore planning and execution
  games/         points, levels, the three mini-games, the question bank, the event schedule
  pay/           Stripe and payOS clients and the order lifecycle
  ui/editor.js   blueprint view and its buttons, menus and modals
  blueprints.js  the plan being edited (in memory, 15 minutes)
  security/      join counter, lockdown planning and restore, anti-nuke counter and action
  activity/      xp, level curve, voice time tracker, giveaways, polls, role menus
  modlog/        moderation commands, case history, the mod log events
  digest/        weekly report numbers, schedule and embed builders
  onboarding/    welcome flow, setup wizard, the share card
  audit/         health check rules, score and safe fixes
  analytics.js   the funnel counters
  web/           the dashboard server: Discord sign-in, API, the public /status route
  humor/         every line the bot says
dashboard/       the dashboard front end, plain JavaScript, one file per tab
scripts/         license CLI, Raspberry Pi installer and updater, website data export
deploy/pi/       systemd unit and timer for the daily update
web/             the website (Next.js), Vietnamese and English
docs/            devlog, architecture, screenshots
test/            node --test
```

More in [docs/architecture.md](docs/architecture.md).

## Development

```bash
npm test                         # all tests, no Discord and no network needed
node scripts/license.js          # prints the license CLI usage
node scripts/export-web-data.js  # refresh the data the website shows (a test fails when it is stale)
cd web && npm install && npm run dev
```

Everything that decides something is a plain module tested with a fake Discord server, a fake clock and a fake `fetch`; command handlers are exercised with minimal fake interactions. Only `src/index.js` and the event files touch the real Discord gateway.

## Engineering highlights

- **Idempotent builds and safe undo.** Creation reports whether it made anything, so a second `/build` creates and posts nothing twice, and `/nuke` deletes only recorded IDs, even after a build that failed halfway: `src/builder.js`.
- **Defence against forged interactions.** Every select, modal and button re-checks the guild, the person and the administrator permission, and role buttons only grant recorded roles: `src/ui/editor.js`, `src/events/interactionCreate.js`.
- **An LLM treated as untrusted input.** Schema-constrained output, a sanitiser, a per-minute bot-wide limit, a per-server monthly quota, a typed error taxonomy and retries: `src/ai/gemini.js`, `src/ai/validate.js`, `src/ai/designer.js`.
- **Restore that cannot escalate privileges.** Administrator is never restored, files from another server lose their other powerful bits, downloads come only from Discord's hosts with no redirect, and every imported field is rebuilt rather than trusted: `src/backups/restore.js`, `src/backups/attachment.js`.
- **Payments without a public endpoint.** Polling of open orders, a single status flip as the exactly-once guard for granting a plan, and a signed request tested against the documented rule: `src/pay/payos.js`, `src/pay/orders.js`, `src/jobs/payments.js`.
- **Licensing and quotas.** Single-use codes over an unambiguous alphabet, plans derived from licenses so nothing needs to expire, and every rule tested with an injected clock: `src/license.js`, `src/utils/gate.js`.
- **Extensible by dropping a file.** Commands, events and background jobs are loaded from their folders; a job never overlaps itself and one failing job cannot stop the others: `src/jobs.js`.
- **Storage that grew with the product.** A move from JSON files to the SQLite module built into Node with an automatic, non-destructive import, WAL mode and daily `VACUUM INTO` copies: `src/db.js`, `src/backup.js`.
- **Operations you can leave alone.** A heartbeat-based Docker health check, alerts that cannot flood a channel, graceful shutdown, and a self-update that rolls back unless the new version becomes healthy: `src/healthcheck.js`, `src/alerts.js`, `scripts/update.sh`.
- **Protection that puts things back.** A lockdown records exactly which channel overwrites and which verification level it changed before touching anything, restores only what is still as it left it, and a job lifts it on time even after a restart: `src/security/lockdown.js`, `src/security/guard.js`, `src/jobs/lockdown.js`.
- **Anti-nuke without guessing.** Deletions are attributed through the audit log, counted per person in a sliding window, and the action only removes dangerous roles the bot may legally remove: `src/security/nukeguard.js`, `src/security/nukeaction.js`.
- **Activity points on a small machine.** Per-person state and a batched write every few seconds keep the hot path off the database; voice time is counted only while someone is really listening: `src/activity/xp.js`, `src/activity/voice.js`.
- **A funnel with nothing personal in it.** One table of server ID, kind and time answers where customers drop off: `src/analytics.js`.
- **A website that cannot drift from the bot.** The theme data on the site is generated from the bot's own code, and a test compares the website's port of the merge with the bot for all 561 mixes: `scripts/export-web-data.js`, `test/webdata.test.js`.

**Numbers:** about 13,400 lines of bot code in 170 files, 561 tests in 31 files that run in about 15 seconds, 35 slash commands, 19 database tables, 8 background jobs, 2 runtime dependencies, an arm64 Docker image of 187 MB, and 11 themes that combine into 561 plans (any mix of up to four) of up to 22 roles, 13 categories and 54 channels. The full story, including what is still missing, is in [docs/devlog.md](docs/devlog.md).

## Roadmap

- Payments by webhook, once there is a public address to receive it (polling is the stand-in)
- A test harness that drives the handlers end to end against a fake gateway
- Languages other than Vietnamese for the bot's own messages
- A committed browser test run in CI for the dashboard and the website
- Sharding and a database server, for the day the bot is in thousands of servers

## Privacy and terms

Plain-language pages are on the website: `/privacy` and `/terms`, in Vietnamese and English.
