# Devlog

An engineering diary of how buildDISCORD went from an idea to a bot running on a Raspberry Pi, with a bilingual website in front of it. It is written for people who want to judge the engineering: what I built, the decisions behind it, what broke, and what I would still fix.

## Summary

buildDISCORD is a Discord bot (nickname "Thầu Xây Dựng", the contractor) that builds a whole server in one command: roles, categories, text and voice channels, permission overwrites, rules, a welcome message and a self-assign role picker. You can mix up to four built-in themes, or describe your group in a sentence and let Google Gemini design the server. Either way, you review and edit a blueprint before anything is created. It is sold per server with one-time activation codes (a free plan and two paid plans), stores its data in SQLite, ships as a Docker image, installs on a Raspberry Pi with one command and updates itself with a health-checked rollback.

Stack: Node.js 22 (ESM), discord.js 14, the SQLite module built into Node, Docker, systemd, GitHub Actions, Next.js 15 with React 19, GSAP and Lenis for the website, deployed on Vercel.

Links: the website is at https://builddiscord.vercel.app and the source is this repository.

### Numbers

These were measured on the repository, not estimated.

| What | Value |
| --- | --- |
| Bot source (`src/`, JavaScript) | about 4,600 lines in 73 files |
| Tests | 128 tests in 11 files (about 2,500 lines), run with `node --test` |
| Scripts (`scripts/`) | about 370 lines (license CLI, Pi installer, updater, website data export, sample generator) |
| Website source (`web/`, TypeScript, TSX, CSS) | about 4,200 lines |
| Slash commands | 17 (16 for customers, 1 owner-only) |
| Database tables | 8 (`guilds`, `licenses`, `usage`, `custom_themes`, `backups`, `scores`, `recurring_events`, `orders`) |
| Background jobs | 2 (payment polling, recurring events) |
| Built-in themes | 11, which give 561 mixes of up to four |
| One theme builds | 8 to 10 roles, 4 to 7 categories, 19 to 26 channels, 10 rules |
| Largest mix of four themes | 22 roles, 13 categories, 54 channels (duplicates merged) |
| Runtime dependencies of the bot | 2 (`discord.js`, `dotenv`) |
| Docker image on the Pi (arm64) | 186 MB at the first deploy, 187 MB with every feature |
| CI | 3 jobs (tests and syntax, website build, image build); every run so far passed |
| Test suite wall time | about 9 s for 128 tests (it was about 38 s for 29 until the builder's pause became configurable, see Bugs) |
| Website first load JS | 165 kB for the landing page, 155 kB for the devlog page (Next.js build output) |

### What this project demonstrates

| Skill | Where to look |
| --- | --- |
| Designing around a platform's constraints (permissions, intents, rate limits, no bot-to-bot invites) | `src/builder.js`, `src/utils/guards.js`, `src/themes/base.js` |
| Idempotent, resumable operations and safe undo | `src/builder.js` (`ensure*`, `nukeServer`), `src/store.js` |
| Data modelling and a storage migration without data loss | `src/db.js`, `test/license.test.js` |
| Licensing and quota logic with a fake clock | `src/license.js`, `src/utils/gate.js`, `test/license.test.js` |
| Integrating an LLM API defensively (schema-constrained output, validation, quotas, retries, error taxonomy) | `src/ai/gemini.js`, `src/ai/validate.js`, `src/ai/designer.js`, `test/ai.test.js` |
| Interactive Discord UI (select menus, modals, buttons) with a pure, testable core | `src/ui/editor.js`, `src/blueprints.js` |
| Operations: health checks, alert throttling, backups, graceful shutdown, rollback | `src/events/ready.js`, `src/alerts.js`, `src/backup.js`, `src/healthcheck.js`, `scripts/update.sh` |
| Packaging and delivery: Docker, systemd, CI, a public repository without secrets | `Dockerfile`, `docker-compose.yml`, `scripts/install-pi.sh`, `.github/workflows/ci.yml` |
| Front end: i18n routing, server and client components, scroll-driven and pointer-driven animation with accessibility fallbacks | `web/app/[lang]/`, `web/components/Motion.tsx`, `web/components/Plotter.tsx`, `web/components/EditorDemo.tsx` |
| One source of truth between the bot and the website, enforced by a test | `scripts/export-web-data.js`, `test/webdata.test.js` |
| Payment integration without a public endpoint, exactly-once settlement | `src/pay/payos.js`, `src/pay/orders.js`, `src/jobs/payments.js`, `test/payments.test.js` |
| Handling untrusted files and privilege boundaries (backup import and restore) | `src/backups/restore.js`, `src/backups/attachment.js`, `test/backup.test.js` |
| Scheduling with time zones and no libraries | `src/games/schedule.js`, `src/jobs/events.js`, `test/events.test.js` |
| Testing without the network | fake guild in `test/builder.test.js`, stubbed `fetch` in `test/ai.test.js` |

## Timeline

The first commit is dated 2 Oct 2026 and the work continued through 3 Oct 2026. The phases below follow the order I actually did things in.

### Phase 0: idea and constraints

Every new Discord server starts with an empty channel list and one channel called general. Setting up roles, channels, permissions, rules and a welcome takes an hour, and most people give up halfway. I wanted one command that gives a server a personality, and I wanted it funny, because rules like "no ads, if you could really get rich in three days you would not be sitting here" are the kind of rules people actually read.

Before writing code I wrote down the constraints the platform imposes, because they shape the design:

- **A bot cannot add another bot.** I wanted the new server to come with a music bot and a text-to-speech bot. Discord only lets a person invite a bot through the OAuth authorize page. So the builder creates the DJ booth, the karaoke room and the text-to-speech channel and posts a link button for the bots I configure. An admin clicks once. It is less magic than I wanted and exactly as much as the platform allows.
- **Permissions decide what is possible.** Creating channels needs Manage Channels, roles need Manage Roles, and a bot cannot create a role above its own highest role. The simplest robust choice is to invite the bot with Administrator, and to check for the specific permissions anyway so the error message names what is missing (`missingBotPermissions` in `src/utils/guards.js`).
- **No privileged intents.** The bot only needs the `Guilds` intent. It never reads message content, so there is no Message Content intent to justify to Discord later, and the privacy story is simple.
- **Rate limits.** A server with thirty channels is roughly a hundred API calls. Creation has to be paced.

### Phase 0b: reading my own earlier bots

I already run two Discord projects, a music bot (musiDISCORD) and a bot that keeps channels lively (companionsDISCORD). Before starting I read both to reuse conventions instead of reinventing them:

- ESM (`"type": "module"`), Node 20 or newer.
- An `index.js` that auto-loads every file in `src/commands` and `src/events`, with commands as `export default { data: SlashCommandBuilder, execute }` and events as `{ name, once, execute(client, ...args) }`.
- A separate `deploy-commands.js` that registers slash commands on one guild when `GUILD_ID` is set (instant) and globally otherwise.
- A `config.js` that validates required environment variables at startup and exits with a clear message.
- A Dockerfile and compose file with a bounded JSON log, and, for the Pi, a one-command installer plus a systemd timer that updates from GitHub.

Reusing the shape meant the new project felt familiar on the Pi, where three projects now live side by side as separate folders, compose projects and containers.

### Phase 1: scaffold

`src/index.js` creates a client with only the `Guilds` intent, loads commands and events dynamically, logs unhandled rejections, and handles `SIGTERM` and `SIGINT` by destroying the client before exiting (so `docker stop` is clean). `src/config.js` validates `DISCORD_TOKEN` and `CLIENT_ID`.

### Phase 2: the data model for themes and plans

A theme is plain data. A **plan** is what the builder executes:

```js
{
  id, label, welcome,
  roles:      [{ key, name, color, hoist?, perms?, pick? }],
  rules:      [string],
  categories: [{ name, staff?, channels: [{ name, type, topic?, kind?, readonly? }] }]
}
```

Two fields carry most of the design:

- `kind` marks channels the builder fills with content after creating them (`rules`, `welcome`, `roles`, `dj`, `tts`). Themes never contain the logic for posting rules, they only say which channel is which.
- `staff` marks a category that only moderators and the owner role can see.

`src/themes/base.js` holds the parts every server gets (an admin area, the DJ and text-to-speech rooms, a mod-only area, four base roles, eight base rules). A theme file adds its own roles, categories and two extra rules. Keeping content as data made it cheap to test: one test loads every theme and asserts Discord's limits (at most 250 roles and 500 channels, names at most 100 characters), unique names, and that each plan contains the five `kind` channels.

### Phase 3: the builder

`src/builder.js` is the part that touches Discord the most. The decisions that mattered:

**Idempotency.** `ensureRole`, `ensureCategory` and `ensureChannel` look in the guild's cache for something with the same name (and the same parent for channels) and reuse it. `ensureChannel` returns `{ channel, created }`. Only channels with `created: true` get content, so running `/build` a second time creates nothing and posts nothing twice. The first version did not do this: a second run created a second copy of every channel and posted the rules twice. That bug is what produced the `created` flag.

A detail that bites: Discord lowercases text channel names and replaces spaces with dashes, but leaves voice channel names alone. The lookup has to normalise the same way, otherwise it never finds the channel it created last time.

**Permission overwrites.** Mod-only categories deny `ViewChannel` to `@everyone` and allow the mod and owner roles. Read-only channels (rules, welcome, role picker, announcements) deny `SendMessages` to `@everyone`. The bot posts into those channels itself, which only works because it has Administrator or an explicit allow. I call that out in the README because it is the kind of thing that fails silently.

**Pacing and feedback.** Each creation is followed by a 350 ms pause (`BUILD_STEP_DELAY_MS`, which the tests set to zero). Progress is one Discord message that is edited in place every third step, with a ten-segment bar, instead of a new message per step.

**A per-guild lock.** `lock.tryAcquire(guildId)` is an in-memory `Set`, so two administrators cannot run two builds in the same server at once.

**A record of what was created.** Every created role, category and channel ID is pushed into a per-guild record in the database. `/nuke` deletes by those IDs, never by name. It deletes channels, then categories, then roles, and it deliberately skips the channel the command ran in, because deleting that channel would cut off the reply. After a skip it rewrites the record so only the skipped channel remains. The record is saved in a `finally` block, so a build that dies halfway still leaves a record that `/nuke` can use; a test makes the sixth channel creation fail and then nukes what exists.

**Defending the role buttons.** The role picker posts buttons whose `customId` is `pickrole:<roleId>`. Anyone can forge a `customId` in a crafted interaction, so the handler only grants a role if its ID is in the guild's recorded `pickRoles` list. A forged button cannot hand out an admin role.

### Phase 4: how I tested without Discord

I did not want the test suite to need a token or a network. Three techniques did most of the work:

- **A fake guild** (`test/builder.test.js`). A small object with `roles`, `channels`, `create`, `fetch`, `send` and `setSystemChannel`, backed by `Collection`s. It lowercases text channel names the way Discord does, so the idempotency lookup is tested against realistic names. The test builds a theme, builds it again, and counts roles and channels and posted messages. A second test builds and then nukes.
- **Injectable time.** `getPlan(guildId, now)`, `redeem(code, guildId, now)`, `createLicense(plan, days, now)`, the usage counters and the backup file name all take a `now` parameter that defaults to `Date.now()`. A license test can say "29 days later the plan is still Pro, 31 days later it is free" without sleeping.
- **A stubbed `fetch`** (`test/ai.test.js`). The Gemini client calls the global `fetch` at call time, so tests replace `globalThis.fetch` with a function that returns canned model lists, answers, 429s and 403s, and records the request headers.

Everything runs under `node --test` and finishes in about 2.5 seconds. The suite is about 510 lines for about 1,850 lines of bot code. The honest limit: the Discord-facing handlers (the command `execute` functions and `ui/editor.js`) are covered only through the pure modules they call, not end to end against a real gateway in CI. I ran those flows by hand on a real server before moving the bot to the Pi.

### Phase 5: the first website

I built a landing page early, because the project needed a face and I wanted to practise a scroll-driven interface with real accessibility fallbacks.

- **Next.js 15 (App Router), React 19, TypeScript.** Languages are a dynamic segment (`app/[lang]`), with `generateStaticParams` for `vi` and `en` and a rewrite from `/` to `/vi`, so Vietnamese lives at the root and English at `/en`. Page copy is typed dictionaries (`content/vi.ts`, `content/en.ts`) that implement one `Dict` type, so a missing key in one language is a compile error.
- **Theme before paint.** A tiny inline script in `<head>` reads `localStorage` or `prefers-color-scheme` and sets `data-theme` before first paint to avoid a flash. Colors are CSS custom properties, redefined for the light theme.
- **One signature scene.** A pinned section where a server assembles itself as you scroll: roles appear, then categories and channels, then the rules card and a "signed off" stamp. It is a GSAP timeline with `scrub`, pinned by ScrollTrigger for 2,600 px, driven by Lenis connected to the GSAP ticker.
- **Reduced motion is a different code path, not a shortened animation.** The setup runs inside `gsap.matchMedia()` under `(prefers-reduced-motion: no-preference)`. With reduced motion, nothing pins, Lenis is never created, and every step's text is visible. The `.pinned` class that changes layout is only added by the motion branch, so the no-JavaScript and reduced-motion layouts are the plain document flow.
- **Accessible split text.** Headings are split into words or letters for the entrance animation, but each heading keeps one `aria-label` with the full text and hides the pieces from assistive technology. Each word sits inside an `overflow: hidden` mask; Vietnamese capitals with stacked diacritics were clipped until I added vertical padding and a looser line height on the mask.
- **Mobile.** A phone has no room to pin a heading above a server tree, so on narrow screens the pinned scene's heading is visually hidden but kept for screen readers.

I checked layouts with a small script that drives headless Chrome over the DevTools protocol: screenshots at desktop and phone sizes in both themes, `scrollWidth - innerWidth` for horizontal overflow, console errors, anchors that point to missing ids, duplicate ids, and the reduced-motion branch. The script is a local helper, not part of the repository, which is one of the gaps listed under Limitations.

### Phase 6: mixing themes

Mixing "study", "gaming" and "chill" first produced three channels called `meme` and three called `fighting`. `composePlan` in `src/themes/index.js` fixes that:

1. Start with the shared admin category.
2. For each picked theme, add its categories.
3. Skip a category whose name was already added, and drop any channel whose name was already used anywhere. Drop categories left empty.
4. End with the DJ category and the mod-only category.
5. Concatenate roles and extra rules from every theme.

`buildPlan(ids)` accepts an array or a `+`-joined string (`gaming+hoc-tap`), which matters because the string travels through a button `customId` and a database row. `/build` takes `theme` plus optional `theme2` to `theme4`. A test checks a three-theme mix for duplicate names and Discord limits, and later tests check every mix of up to four themes (561 of them) against the limits and against the website's port of the merge.

### Phase 7: from JSON files to SQLite

Per-server JSON files were fine for one test server. Licenses, usage counters and a monthly AI quota need atomic updates and queries, so I moved to SQLite through `node:sqlite` (`DatabaseSync`), which is built into Node 22.13 and later. That removed a native dependency (no `better-sqlite3` build on arm64) and kept the runtime dependency list at two packages.

Schema (`src/db.js`):

| Table | Columns |
| --- | --- |
| `guilds` | `id` (primary key), `record` (JSON text), `updated_at` |
| `licenses` | `code` (primary key), `plan`, `days`, `created_at`, `guild_id`, `redeemed_at`, `expires_at`, index on `guild_id` |
| `usage` | `guild_id`, `month`, `feature`, `count`, primary key on the first three |

Choices worth noting:

- **WAL mode** (`PRAGMA journal_mode = WAL`) so a daily backup can read while the bot writes.
- **The record is a JSON blob** in `guilds`. It is read and written whole and never queried by field, so a document column is simpler than three more tables.
- **`usage` uses an upsert** (`ON CONFLICT ... DO UPDATE SET count = count + excluded.count`), with the month key `"all"` for lifetime counters.
- **Migration on first open.** `migrateJson` imports each `<guildId>.json` with `INSERT OR IGNORE` and renames the file to `.migrated`, so nothing is deleted and running it twice is harmless. A test writes an old-style file, opens the database and asserts the data arrived.
- **A thin `store.js`** (`loadRecord`, `saveRecord`, `clearRecord`) kept `builder.js` unchanged during the move.
- **`node:sqlite` still prints an `ExperimentalWarning`.** I pass `--disable-warning=ExperimentalWarning` in `npm start`, `npm test` and the Docker `CMD`, and set `engines.node` to `>=22.13`. A one-off command that does not pass the flag (for example `docker compose run bot node src/deploy-commands.js`) still prints it, which I saw on the Pi and left alone.

### Phase 8: plans and licenses

The business model is one shared bot, billed per server, with activation codes made by hand. Payments are manual on purpose: a payment gateway needs webhooks and an always-on public endpoint, which is a lot of surface for a product with no customers yet.

- **Codes.** `THAU-XXXX-XXXX-XXXX`, built from 12 random bytes over a 32-character alphabet with no `0`, `O`, `1` or `I`, so a code typed from a screenshot is hard to get wrong. Because 32 divides 256, `byte % 32` has no modulo bias, and 12 characters carry 60 bits of entropy. Input is normalised (trimmed, whitespace removed, uppercased) before lookup.
- **Redeeming.** A code is single use. Redeeming a second code of the same plan adds its days after the current expiry instead of overlapping. The `UPDATE` carries `AND guild_id IS NULL` as a guard; I do not check the changed-row count, because the synchronous `node:sqlite` driver in a single process cannot interleave two redemptions. If this ever ran with several processes, that check would need to be added.
- **Plans are derived, not stored.** `getPlan` returns the highest-ranked license whose `expires_at` is in the future, otherwise `free`. Expiry needs no cron job because there is nothing to flip. Limits live in one table in `src/license.js`: whether mixing is allowed, total builds, AI designs per month.
- **Gates** (`src/utils/gate.js`) turn limits into refusals with a plain message. `gateBuild` is checked when the blueprint opens and again when the build button is pressed, since the plan can change in between. A successful build increments a lifetime counter.
- **A CLI** for me, the owner: `npm run license -- new pro 30d`, `grant`, `revoke`, `list`. `/admin` offers the same inside Discord for the owner IDs in `OWNER_IDS`.

The free-plan restrictions and the plan table are all tested with a fake clock: activation, expiry, double use, extension, plan precedence, revoke, invalid inputs, per-month and lifetime counters, and the gates.

### Phase 9: operations

I wanted to be able to leave it running.

- **Alerts that cannot flood.** `alert(text)` posts to a Discord webhook, capped at 1,900 characters, and the same message (keyed by its first 120 characters) is sent at most once every five minutes. A crash loop produces one message, not hundreds.
- **A health check that means something.** The bot writes `data/heartbeat` every 30 seconds. `src/healthcheck.js` exits 0 only if the file is less than 90 seconds old. The Dockerfile's `HEALTHCHECK` runs it every 30 seconds with a 60-second start period. "Running" and "healthy" are different things, and the updater waits for the second.
- **Daily database copy.** `backupDb` uses `VACUUM INTO` to write a consistent copy while the database is in use, one file per UTC date, keeping the last seven. It checks every six hours so a restart never skips a day. A test writes ten days of copies and asserts seven remain.
- **Graceful shutdown** on `SIGTERM` and `SIGINT`.
- **Error paths.** Interaction errors are logged, alerted and answered with a friendly ephemeral message instead of an unhandled promise rejection.

### Phase 10: the AI designer

`/thietke` takes a description and asks Google Gemini to design the themed part of the server. The interesting part is not the call, it is everything around it.

**Client** (`src/ai/gemini.js`). It uses the REST API through `fetch` with no SDK, so there is nothing to install and the tests can replace `fetch`. The API key goes in the `x-goog-api-key` header, never in the URL, so it cannot end up in access logs or error messages. Each call has a 30-second timeout through `AbortSignal.timeout`.

**Model auto-resolution.** Free-tier model names and limits change often, so I do not hard-code a model. `resolveModel` lists the models the key can use and keeps those that support `generateContent`, whose name contains `flash`, and does not match `/lite|preview|exp|thinking|tts|image|live|audio|latest|\d{3,}/`. It sorts by the version parsed from the name and picks the newest, caches the result, and clears the cache and re-resolves once if a call returns 404. `GEMINI_MODEL` overrides all of it. The first real call picked a model name I had not heard of, which is the argument for not hard-coding.

**Structured output.** The request sets `responseMimeType: "application/json"` and a `responseSchema` (label, welcome, roles, rules, categories with channels, each channel with a `type` enum of `text` or `voice`). The model cannot return free-form prose.

**A global limiter.** One free key serves every customer, so `takeSlot` caps the whole bot at ten requests per minute with a sliding window before Google gets a chance to say no. On top of that sits a per-server monthly allowance (20 for Pro, 100 for Plus) in the `usage` table.

**An error taxonomy.** `AiError.kind` is one of `off`, `key`, `quota`, `busy`, `unavailable`, `model` or `bad`. Each maps to a different Vietnamese message in `/thietke`, and all of them say the attempt was not counted. HTTP 400, 401 and 403 become `key` when the body or status says so and `bad` otherwise, 429 becomes `quota`, any 5xx becomes `unavailable`, and 404 becomes `model`.

**Retry policy.** One retry for an unusable answer (`bad`), one re-resolve for a missing model, and for `unavailable` up to two retries with waits of 1.5 s and 4 s. The waits are exported as `retry.delays` so tests set them to zero. `designServer` adds one more attempt when the cleaned answer is unusable. The usage counter is only incremented after a successful design.

**Never trust the answer.** `sanitizeDesign` in `src/ai/validate.js` turns whatever came back into a theme the builder can run:

- strips `@everyone`, `@here` and Discord mention syntax, collapses whitespace, caps lengths;
- drops anything matching a short blocked-word list, applied with Unicode-aware lookarounds;
- caps counts (6 categories, 8 channels per category, 8 roles, 6 rules);
- normalises text channel names the way Discord does and keeps voice names as written;
- parses role colors from `#RRGGBB` with a palette fallback and never accepts black;
- forces the welcome to contain `{user}`;
- throws `DesignError` when no usable category remains.

The result is merged with the shared parts through `composePlan`, so an AI server always has rules, welcome, a role picker, a DJ booth and a text-to-speech channel, and it is shown as an editable blueprint. Nothing is created from a model's output without a person pressing build.

**Prompt injection stance.** The description is capped at 400 characters (also enforced by the slash command option), wrapped in triple quotes in the user message and never concatenated into the system prompt. The system prompt says to treat it as data and ignore any instructions inside. This is a mitigation, not a guarantee, which is why the output is also schema-constrained, sanitised and previewed.

**Tests.** Thirteen tests in `test/ai.test.js`, most of them with a stubbed `fetch`: good and bad designs, blocked words and mentions, composing into Discord limits, model selection, the key in a header and not the URL, quota and key errors, the bot-wide limit (ten calls pass, the eleventh is `busy`), retry once then give up, the description staying out of the system prompt, blueprint edits and expiry, 5xx retry then `unavailable`, and the word filter against both blocked words and innocent look-alikes.

**A real call.** With a real free key, one run for "eight college friends who play Valorant on Saturday nights and chat a lot" produced six categories in the merged plan (three themed, plus the shared admin, DJ and mod-only ones), 24 channels and 9 roles, in the troll humor level. Every run is different, so the site's example is labelled as one real answer.

### Phase 11: the blueprint editor

The first version of the preview was an embed with two buttons. People want to drop one category or rename another before anything exists, so the preview became an editor.

- **Pure core.** `src/blueprints.js` holds an in-memory `Map` of blueprints (random 8-hex id, guild, user, a deep copy of the plan, a 15-minute expiry pruned on access) and three pure edit functions: `removeCategory`, `renameCategory`, `addChannel`. They are unit-tested without Discord.
- **Rules the edits enforce.** The first category (the admin area) cannot be removed, because the rules, welcome and role-picker channels live there. Renames cannot collide with another category. New channels are rejected when the name already exists anywhere in the plan, and go into the first themed category or into a new "Khu Mới" category placed before the DJ area.
- **Routing by `customId` prefix.** Everything the editor sends uses ids like `bp:remove:<id>`, `bp:renamem:<id>:<index>` and `bp:go:<id>`. `interactionCreate` splits on `:` and sends scope `bp` to the editor, `pickrole` to the role handler, and anything else to the command whose name matches (so `/nuke` and `/xoadulieu` own their confirm buttons through an optional `handleButton`). Select menus and modal submits flow through the same router as buttons.
- **Select menus, modals, buttons.** Two select menus (remove, rename), a modal for the new name, a modal for a new channel, and three buttons (add, build, cancel). The "remove" menu is omitted when there is nothing removable, because Discord rejects an empty select.
- **Update versus reply.** A modal submitted from a component can update the original message, but a modal opened from a slash command cannot. `respond()` checks `interaction.isFromMessage()` and calls `update` or `reply` accordingly. Getting that wrong gives "interaction failed" with no useful error.
- **Authorisation on every click.** The handler checks that the blueprint still exists for this guild, that the clicker is the person who opened it, and that they are an administrator. A guild admin can also change who may run a command from the server's integration settings, so the commands set `setDefaultMemberPermissions` and also check `isAdmin` at runtime.
- **Limits.** Blueprints live in memory and are lost when the process restarts. A blueprint left open across a restart answers "expired, run the command again". That is an acceptable cost for a 15-minute scratch object, and a deliberate choice over putting half-edited drafts in the database.

### Phase 12: packaging and delivery

- **Docker.** `node:22-alpine`, `npm install --omit=dev`, copy `src`, a `HEALTHCHECK`, and `CMD` with the warning flag. The data directory is a bind-mounted volume. The image is 186 MB on the Pi.
- **Compose.** A named container, a bounded JSON log (`max-size: 5m`, `max-file: 2`) and `restart: unless-stopped`.
- **`scripts/install-pi.sh`.** Adapted from the installer in my other bot, a POSIX `sh` script: installs Docker and git if missing, clones the project, asks for the token and application ID with the token read silently, never overwrites an existing `.env`, builds and starts the container, optionally installs the update timer, and supports `--yes` and `--dry-run`. It is safe to run twice.
- **`scripts/update.sh`.** Takes a lock with `flock` so two updates cannot overlap, refuses to run with uncommitted changes, fetches and accepts fast-forward only, rebuilds, then polls `docker inspect` for `running`, zero restarts and `healthy` for up to 150 seconds. If the new version does not become healthy it runs `git reset --hard` to the old commit, rebuilds and checks again, and exits non-zero either way so the failure is visible in the journal.
- **systemd.** A oneshot service and a timer that runs daily with a randomised delay and `Persistent=true`.
- **CI** (`.github/workflows/ci.yml`). Three jobs: `npm ci`, tests and a `node --check` syntax pass over every source file; a website job with `npm ci` and `npm run build`; and an image job that builds the Docker image. Every run so far has passed.
- **Public repository hygiene.** Before the first push I listed the staged files and scanned them for token-shaped strings. `.gitignore` excludes `.env` and the whole `data/` folder. `.gitattributes` forces LF for `*.sh`, `*.service` and `*.timer`, because Git on Windows was warning about CRLF conversion and a shell script with CRLF endings fails on Linux in confusing ways. I also ran `sh -n` over both shell scripts.

### Phase 13: the first deploy

Vercel: `vercel link` and `vercel deploy --prod` from the `web/` folder, so only the website is uploaded. The domain is the free `builddiscord.vercel.app`, and the page's canonical metadata and the repository homepage point to it.

Raspberry Pi 5 running Kali Linux (arm64), next to the music bot, its audio server, a status monitor and the companion bots:

1. `git clone` of the public repository.
2. The `.env` file copied with `scp` and set to mode 600. The repository is public, so the token and the API key never go through Git, and my checks only listed which keys were set, never their values.
3. `docker compose up -d --build`. The first build took a few minutes on the Pi. The container reported healthy within seconds of starting and the log showed the bot online.
4. `docker compose run --rm bot node src/deploy-commands.js` registered the 8 slash commands globally.

The `.local` mDNS name of the Pi did not resolve from Windows, so I used its LAN address. The container runs as root, so `data/` on the host is owned by root; it is ignored by Git, so the updater's "no uncommitted changes" check is not affected. Installing the systemd timer needs `sudo`, which asks for a password, so that last step is left for the owner to run by hand (the commands are in the README).

### Phase 14: pricing and legal

- **Plans.** Free (one theme, one build, no AI), Pro (mixing, unlimited builds, 20 designs a month) and Plus (100 designs a month). Prices are in US dollars per server per 30 days, chosen to sit inside the range paid Discord bots charge in the United States, with Vietnamese customers paying the VND equivalent at the day's rate. Codes are made by hand with the license CLI for the number of days sold.
- **Pages.** Plain-language privacy and terms pages in both languages. The privacy page lists exactly what is stored (guild ID, theme, IDs of what the bot created, license, usage counters) and says message content is never read. It also says that a `/thietke` description is sent to Google Gemini and that the free tier lets Google use it to improve its products.
- **A refund rule** (7 days for an unused code, none for an activated one except for long outages) is a business decision I made and wrote into the terms.
- **Honesty about the product.** An early version of the `/goi` command listed "backups" for the paid plans, which did not exist yet. I removed it before publishing. A plan table should only list what the code does.

### Phase 15: the website, second pass

The first site was a good-looking brochure. For a project I want people to judge, it should also let them try the product, so I rebuilt it around things you can touch. The direction stayed a blueprint sheet, but in daylight: cool white paper, ink-blue lines, and tangerine, mint and sun yellow as the only colors, with a dark variant behind a toggle. Fonts are Big Shoulders for lettering (it reads like drafting letters) and Be Vietnam Pro for text.

**One source of truth.** The page should never claim something the bot does not do, so the numbers on it come from the bot. `scripts/export-web-data.js` writes the bot's theme data (role names, categories, channels and rule counts, plus the shared parts) to `web/content/themes.data.json`, and the page merges themes with `web/lib/compose.mjs`, a port of the bot's merge (see Phase 17 for how the port is kept honest). `scripts/sample-designs.js` makes three real Gemini calls, one per humor level, and saves the answers with the date and model name. `test/webdata.test.js` fails if the committed data differs from what the bot builds now, and a second check fails if the website's copy of this devlog is stale. The website deploys from the `web/` folder alone, so it cannot import from the bot's `src/`; the generated files, plus the test, are how the two stay in step.

**What you can do on the page.**

- **The drafting table in the hero** (`Plotter.tsx`): toggle up to four of the eleven themes in any mix and the counters roll to the real numbers for that combination (for example, booking alone gives 7 categories, 26 channels and 10 roles) while the tree re-plots. "Try a build" replays a progress run and slams a stamp.
- **The pinned scene** (`BuildScene.tsx`): a server assembles itself while you scroll. It only pins on wide screens without reduced motion; elsewhere it is a static sheet with every step visible.
- **The AI section** (`AiDemo.tsx`): three real answers, one per humor level, typed out when you switch.
- **A working miniature of the blueprint editor** (`EditorDemo.tsx`): remove a category, rename one in place, add a channel, press build. It follows the bot's rules from `src/blueprints.js`: the admin area cannot be removed, renames cannot collide, a duplicate channel name is refused, text channel names are normalised the way Discord does it.
- Plan cards that lean toward the mouse, command names that copy themselves, a footer word whose letters lift near the pointer, and a drafting crosshair with live coordinates plus a scroll ruler on the left edge of wide screens.

**How the motion is organised.**

- The landing page is a server component. Interactivity lives in small client leaves, and `Motion.tsx` is the only place that starts Lenis (the single smooth-scroll engine) and the page-wide GSAP work: heading reveals, drawn dimension lines, card reveals, the crosshair and magnetic buttons.
- Everything runs inside `gsap.matchMedia()`. Under `prefers-reduced-motion: reduce` Lenis is never created, nothing pins, there is no crosshair, and every element is shown in its final state. The pointer features are additionally gated on `(pointer: fine) and (hover: hover)`.
- **No flash and no hidden content without script.** The CSS hides split words, cards and dimension lines only under a `js` class that an inline script sets before first paint, and the same rules carry their own 3-second CSS animation that reveals everything if the scripts never run. When script does run, it clears that animation and takes over with GSAP's own starting states. The CSS uses the individual `translate` and `scale` properties so it never fights GSAP's `transform`.
- The drifting grid is one fixed layer moved with a transform whose period is 120 px, which is the grid's period, so the loop never shows and the page never repaints a large background.

**The devlog page you may be reading.** It renders this very file. A small Markdown reader (`web/lib/markdown.tsx`, about 170 lines) turns headings, lists, tables, code fences and inline formatting into elements, builds the contents list with a scroll-spy, adds copy buttons to code, and turns the "Numbers" table into figure cards, so the figures on the page cannot drift from the text.

**Checking it.** A headless Chrome script (driven over the DevTools protocol, kept outside the repository) walks the page: it toggles themes, switches the AI level, edits the blueprint through the real inputs, copies a command, and then checks console errors, horizontal overflow at desktop and phone widths, broken anchors, duplicate ids and the reduced-motion path. It caught two real problems: a stamp scaled up inside the pinned scene made the page scroll sideways, and a global animation tried to target elements that do not exist on the devlog page.

### Phase 16: the clean-up pass

When the features were done I did a hygiene pass over the repository, my computer and the Raspberry Pi, because what you leave behind is part of the work.

- **The repository.** I checked the tree and the history for secrets, database files, build output and tool configuration files. None are tracked, and the commit messages are plain descriptions of the change.
- **My computer.** I removed the Next.js build output (94 MB), the temporary Vercel token file that `vercel link` creates, the local test data folder, and 73 temporary directories left behind by test runs and headless browser sessions. I kept `node_modules` (a reinstall away) and the `.env`.
- **A record I did not want to lose.** The local test data held the record of what the first version had built on my test server. I copied it to the Pi, where the importer from Phase 7 picked it up on the next start and renamed the file, so `/nuke` on the Pi still knows what to remove there.
- **The Pi.** I rebuilt the container from the new commit and waited for it to report healthy, then removed 24 dangling images and the build cache with `docker image prune` and `docker builder prune` (images went from 29 to 5, and 161 MB of cache was freed). The music bot, its audio server, the monitor and the companion bots kept running the whole time.

### Phase 17: seven more themes, and a server for booking a friend

Four themes were enough to prove the idea but not to be useful. I added seven: **book a friend**, anime fans, coders, content creators, cinema and music, an office team, and pet lovers. Each is plain data in `src/themes/` (roles, categories, channels, two extra rules, a welcome), so adding one is a file plus one line in `index.js`.

**The booking theme.** Some communities are built around booking a person's time: you hire someone to play a game with you, or to talk. I looked for how such servers are laid out and found little useful in public sources, so I designed it from the structure these communities share and from what makes them safe or unsafe. The result has a reception area (booking guide, price list, an anti-scam channel, a place to post proof of a transaction), a list of players (profiles, today's free slots, customers looking for a player), voice rooms for playing together, waiting and talking, and a trust area (feedback after each session, a hall of fame, a complaints channel). The safety choices are in the data, not just the copy:

- **Trust roles are handed out by people, never picked.** "Verified player", "popular player" and "regular customer" are not self-assignable. The role picker only offers roles with `pick: true`, and a test asserts that those three have it off.
- **Two rules written for this theme:** every transaction goes through the official channel with staff confirmation, and nobody asks for or gives personal information (address, phone number, documents); and players and customers must be 18 or older, arrive on time and cancel in advance.
- **No claim of privacy it cannot keep.** I first named a voice room "private talk room", then renamed it, because the bot does not set permissions that would make it private.

**Rules that hold for every theme, as tests.** With eleven themes mixing safely matters more, so the suite now checks that no role key or role name is used by two themes (the merge would silently share a role), that no self-assignable role carries permissions, and that every mix of up to four themes (11 + 55 + 165 + 330 = 561) stays inside Discord's limits of 250 roles and 500 channels. The largest mix of four builds 22 roles, 13 categories and 54 channels.

**Keeping the website honest with eleven themes.** With four themes the exporter could precompute every combination. With eleven, 561 precomputed plans would be far too much for a page's JavaScript. So the website now receives the raw theme data (about the size of the themes themselves) and merges it in the browser with `web/lib/compose.mjs`, a 40-line port of `composePlan`. It is plain JavaScript with a `.d.mts` file for types, so the bot's test suite can import it. `test/webdata.test.js` compares the port with the bot's own `buildPlan` for all 561 mixes (labels, role names, rule counts, category and channel names, staff flags and counts), and the exported data is checked against the theme files. If I change the bot's merge and forget the port, the suite fails.

### Phase 18: humor levels

The three humor levels (gentle, troll, absurd) were a plan item for a long time, and the design question was what a "level" is. The answer that kept the system simple: a level changes words, never structure. `src/themes/humor.js` holds three versions of the eight shared rules and, for every built-in theme, a gentle and an absurd welcome (the troll welcome stays in the theme file). `composePlan(picked, { humor })` swaps those in and records the level on the plan; roles, categories and channels are untouched. That matters because the builder is idempotent by name: rebuild a server at another level and it recognises everything that exists, so only the words that were never posted differ.

Tests pin that down: every level has the same number of rules, every theme has welcomes for every level and each contains `{user}`, an unknown level throws, and for several mixes the structure (roles and categories) is deeply equal across levels while the welcome and the first eight rules differ. Free servers keep troll, and choosing another level is a Pro feature checked by `gateFeature`. Saved and AI themes have no per-level welcome, so they keep the one they were written with and only the shared rules change.

**A bug that no test could have caught until one existed.** In `/build` I named the chosen level `humor`, which shadowed the imported module of the bot's lines that the same function used a few lines earlier. The result was a temporal-dead-zone error the moment anyone ran the command. The unit tests did not notice because they never ran the handler. I renamed the variable and added `test/commands.test.js`, which runs `/build` with a minimal fake interaction (free server, mixing refused, humor refused, Pro server allowed, non-admin refused). That was the start of driving handlers directly in tests.

### Phase 19: automatic payments

Manual codes were the right first step, but selling means someone has to be awake. The target was `/mua goi:pro`, a QR code, and a plan that switches on by itself. I chose payOS because it takes Vietnamese bank transfers (QR through VietQR), has no monthly fee, and its API is small. The constraints shaped the design:

- **No public address.** The bot runs on a Raspberry Pi behind a home network, and payOS's normal way to report a payment is a webhook. Instead of putting a public endpoint (and a shared secret) on a serverless function, the bot polls: a job asks payOS about its own open orders every 30 seconds. All secrets stay on one machine, and there is no endpoint to attack or to keep available. The cost is up to 30 seconds of latency and a limit on how many orders can be open at once, both fine at this size.
- **Exactly-once.** An order row goes `PENDING` to `PAID` with `UPDATE ... WHERE status = 'PENDING'`; only the call that actually changed a row grants the license. Polling the same paid order twice, or two overlapping rounds, cannot grant it twice. A test polls a paid order twice and asserts the expiry did not move.
- **Signing.** payOS signs a payment request with HMAC-SHA256 over five fields in alphabetical order (`amount`, `cancelUrl`, `description`, `orderCode`, `returnUrl`) using the channel's checksum key. A test recomputes the documented string independently and compares.
- **A description limit I would have missed.** For accounts not linked through payOS the description can be at most 9 characters, so it is `THAU` plus the last five digits of the order code, and a test asserts the length.
- **Dollars in, dong out.** Prices are in dollars; the amount charged is the dollar price times days over 30 times `USD_VND_RATE`, rounded to a thousand with a 2,000 minimum. I update the rate by hand, and the amount is shown before anyone pays.
- **Failure paths.** A gateway error marks the order failed and tells the customer plainly; one unreadable order never stops the others in a round; an order still pending after 35 minutes expires; cancelled and expired answers close the order without granting anything.

I could not test this against a live account, and the devlog says so under limitations: it is written against the documentation and a stub, and it needs one real small payment before I trust it.

### Phase 20: keeping a server alive

Building a server is day one. This phase added the things that keep a group there. To let the features be written without touching the same files, I first laid shared groundwork: all new tables in one schema, the new plan limits in the plan table, `gateFeature` and `gateLimit` helpers, a router that lets a command own every component whose id starts with its name (buttons, menus, modals and autocomplete), and a job registry (`src/jobs.js`) that runs every file in `src/jobs` on its own timer without overlapping itself. After that each feature was a handful of new files.

- **Saved themes.** The editor gets a "save as my theme" button. `extractCustomTheme` keeps only the custom part of a blueprint (categories that are not the three base ones, roles that are not base roles, extra rules, welcome, label), and `sanitizeCustomTheme` rebuilds every field from scratch when a theme is loaded or imported, so a saved theme can never carry permissions and an imported file cannot smuggle anything in. A round-trip test builds a mix, edits it, extracts, composes, and compares.
- **Backup and restore.** A snapshot holds roles, categories, text and voice channels and role overwrites (referenced by role name). Restore plans first (a pure function lists what is missing by name and parent), shows exactly what it will create, and then only creates, never deletes or edits. Administrator is never restored, and a file whose source server differs from the target also loses ManageGuild, ManageRoles, ManageChannels, ManageWebhooks, BanMembers, KickMembers and MentionEveryone. Imports come only from Discord's own HTTPS hosts with redirects refused, the real bytes are measured as well as the reported size, and the JSON is rebuilt field by field with hard caps. Everything restore creates is recorded, in a `finally`, so `/nuke` can undo it.
- **Check-in, levels and mini-games.** A daily check-in keyed by the calendar day in the configured time zone (a pure function tested across midnight, a missed day and a zone boundary), streak bonuses, level roles created lazily and recorded for `/nuke` (never self-assignable), and three games with injectable randomness and clocks: guess the number, rock paper scissors duels with private choices, and trivia with a checked question bank. A per-person daily cap on game points stops farming.
- **Recurring events.** A weekly definition stores a weekday and a time; `nextOccurrence` computes the next start in the configured time zone with `Intl` and no library, and a job every five minutes creates the Discord scheduled event when the next start is under 24 hours away, announcing it once and never creating a duplicate.

### Phase 21: deploying the website from Git, and polishing the repository

The website had been deployed from the command line. Making a push deploy it meant connecting the project to GitHub, and the first thing I found was that it was already connected (creating the project had done it) and had been failing silently: every push triggered a production build with the repository root as the project root, where there is no Next.js app, so each Git deployment ended in an error while the command-line deployments kept succeeding. I fixed the project settings through the Vercel API (root directory `web`, and an ignore-build-step command that skips the build when nothing under `web/` changed) and confirmed the next push deployed. One consequence is worth recording: with a root directory set, a deployment from the command line has to run from the repository root, not from `web/`.

Polish for people who find the repository: screenshots of the real site in the README, a social preview image, a tagged release with notes, and the repository description and topics. I also noticed a TypeScript build cache file had been committed by accident, untracked it and ignored the pattern.

## Bugs and what they taught me

| Symptom | Root cause | Fix | Guard now |
| --- | --- | --- | --- |
| Running `/build` twice created duplicate channels and posted the rules twice | Creation did not report whether it created anything, so content was always posted | `ensureChannel` returns `{ channel, created }` and only new channels are filled | Builder test builds twice and counts roles, channels and posts |
| The word filter never blocked Vietnamese words | In JavaScript `\b` only knows ASCII letters, so there is no boundary next to `đ` or `ụ` | Lookarounds `(?<!\p{L})word(?!\p{L})` with the `u` flag | Test that blocked words and mentions are removed |
| After the first fix the filter still did not work, but a test passed | The pattern was built in a normal template string, where `\p` silently loses its backslash, and the test sample happened to pass anyway | `String.raw` for the pattern | A table-driven test now covers blocked words and innocent look-alikes ("bạn đụng xe" and "Essex club" pass, "đụ má" is blocked) |
| `next build` failed on the heading font | I remembered a font family as "Big Shoulders Display"; `next/font` knows it as "Big Shoulders" | Use the real family name | The website job in CI builds the site on every push |
| A `.gitignore` that excluded `data/*.json` would have published the SQLite file with license codes | The storage format changed from JSON to a `.db` file but the ignore rule did not | Ignore the whole `data/` folder | I list and scan staged files before the first push; there is no automated guard |
| Vietnamese capitals were clipped inside animated headings | The overflow mask cut stacked diacritics | Vertical padding and a looser line height on the mask | Visual check in headless Chrome |
| The pinned scene did not fit on a phone | No room for a heading above a server tree | Hide the heading visually on small screens, keep it for screen readers | Screenshots at phone width and an overflow check |
| A modal submission could fail with "interaction failed" | A modal opened from a slash command cannot `update` a message | `respond()` picks `update` or `reply` using `isFromMessage()` | Kept in one helper used by both modal handlers |
| Git warned about CRLF and shell scripts could break on the Pi | Windows checkout converts line endings | `.gitattributes` with `eol=lf` for shell and systemd files | `sh -n` over both scripts |
| An `ExperimentalWarning` printed on every start | `node:sqlite` is still flagged experimental | `--disable-warning=ExperimentalWarning` in start, test and the Docker command | One-off commands that skip the flag still print it |
| The paid-plan table advertised backups that did not exist | I wrote the plan table before the feature | Removed from `/goi` before publishing | README states what exists and keeps the rest under Roadmap |
| Free-tier Gemini sometimes answers with a 5xx | The free service is overloaded at times. I first met it as a raw 503 while generating the website's sample answers, which the client then treated as an unusable answer | A 5xx maps to its own `unavailable` kind, retried with 1.5 s and 4 s waits, then a clear "overloaded" message that does not use up the customer's allowance. The sample script also waits out a quota answer for 65 s | Test with the waits set to zero |
| The suite took about 38 seconds | The 350 ms pause between creations was a hard-coded constant, so the builder tests slept for real | The pause comes from config (`BUILD_STEP_DELAY_MS`) and the tests set it to zero | The suite now runs in about 2.5 seconds |
| A build that crashed halfway left items `/nuke` could not find | The record of created IDs was saved once, after all creation succeeded | The record is saved in a `finally` block | Test: the sixth channel creation throws, then nuke removes everything that was created |
| On a phone the command list scrolled sideways by about 27 px | The space before each argument sat inside a no-wrap span, so `/build theme theme2 theme3 theme4` had no place to break | The space moved outside the span, and the command text may wrap anywhere | The overflow probe in the headless-browser script, run on both languages at phone width |
| `/build` crashed the moment it ran after humor levels were added | A variable called `humor` shadowed the imported lines module used earlier in the same function (a temporal dead zone error) | Renamed it to `level` | `test/commands.test.js` runs the handler with a fake interaction |
| Every push produced a failed Vercel deployment while command-line deploys worked | The project was connected to Git with no root directory, so Vercel looked for the app at the repository root | Root directory set to `web` through the API, plus a skip rule for pushes that do not touch `web/` | A Git deployment after the fix reached READY |
| Two copies of the bot answered commands at the same time | A test terminal on my computer was still running an older version with the same token as the Pi | Stopped the local process | Lesson: one token, one process; the devlog's deploy steps say to stop the local run |
| A TypeScript build cache file was in the repository | `git add -A` picked up `tsconfig.tsbuildinfo` after a type check | Untracked it and ignored `*.tsbuildinfo` | `git status` is clean after a build |
| The page scrolled sideways by about 50 px on desktop | The "signed off" stamp starts scaled up 2.4 times inside the pinned scene, and its transformed box counted as scrollable overflow | `overflow-x: clip` on the scene and on the hero | The headless-browser script compares `scrollWidth` with `clientWidth` on every page |

## Design decisions and alternatives

| Decision | Alternatives I considered | Why this one |
| --- | --- | --- |
| SQLite through `node:sqlite` | Keep JSON files; Postgres; `better-sqlite3` | JSON cannot do atomic counters or queries. Postgres is another service to run on a Pi for three small tables. `better-sqlite3` needs a native build on arm64. The built-in module has zero dependencies |
| `fetch` against the REST API | The official SDK | One endpoint family, easy to stub in tests, one less dependency to audit |
| Blueprints in memory with a 15-minute TTL | A `blueprints` table | They are scratch objects. A restart costs a re-run of a command. A table adds cleanup and migration work for no durable value |
| Manual activation codes | Stripe, PayOS or SePay with webhooks | A gateway needs a public endpoint, signature checks and reconciliation. With no customers yet, manual payment is the cheaper way to learn whether anyone pays |
| One shared bot billed per server | A separate bot per customer (white label) | One process to run and update. Per-customer bots multiply tokens, containers and support work |
| Gemini free tier | A paid model or provider | It costs nothing at this stage. The trade-offs (shared low quota, data-use terms) are controlled with limits and disclosed on the privacy page |
| Typed dictionaries for languages | An i18n library | Two languages, static pages, compile-time key checking, no runtime dependency |
| Plan derived from licenses | A `plan` column updated by a job | Nothing to expire, nothing to drift, one query |
| Administrator when inviting | A narrow permission set | The bot posts into read-only channels it creates and creates roles; a narrow set can fail in subtle ways. The code still checks and names missing permissions |
| A port of the merge in the website, tested against the bot | Precompute all 561 plans; import the bot's code into the site; call an API | Precomputed plans are too big for a page. The site deploys from `web/` alone, so it cannot import from `src/`. An API adds a server for a static page. A small port with an equivalence test over every mix costs about 40 lines and cannot drift silently |
| Poll payOS from the bot | A webhook on a serverless function; a public tunnel to the Pi | No public address is needed, no endpoint to attack, and every secret stays on one machine. The price is up to 30 seconds of delay |
| Levels change words, not structure | A separate set of themes per level | The builder is idempotent by name, so identical structure means a rebuild at another level duplicates nothing, and there is one copy of every channel to maintain |
| Restore only creates | Restore as an exact copy that also deletes | Deleting from a file is the most dangerous thing a bot can do. Creating what is missing is safe to repeat and easy to undo with `/nuke` |
| Components routed by `customId` prefix | A generic router library | About ten lines, and the prefix makes the owner of each id obvious |

## What I would do next and known limitations

- **No end-to-end run against a real gateway.** Command handlers and the editor are driven in tests with minimal fake interactions (for example `/build`, `/mua`, the backup and theme commands and the editor's save button), and everything that decides something is a pure module. But nothing in CI talks to Discord, so the exact shape of a few discord.js calls (scheduled events, the role `colors` option, autocomplete, permission bigints) is checked against fakes only. A shared fake-gateway harness would close that gap.
- **Blueprints are lost on restart,** by design (see Phase 11).
- **The payment integration was written against payOS's documentation and tested against a stub, not a live account.** It needs one real small payment before it is trusted. It polls every 30 seconds instead of receiving a webhook, does not verify the signature on payOS's responses, and relies on a dollar-to-dong rate I update by hand. There is no reminder when a plan is about to expire.
- **Game limits live in memory.** The daily cap on game points and open game rounds reset when the bot restarts, which is fine for fun points and would not be for money.
- **The trivia bank has 34 questions.** Enough to start, repeated within a couple of weeks of daily play.
- **The free Gemini tier is a shared quota with data-use terms.** Limits protect it, but a real customer base would need the paid tier and a data-processing note.
- **One process, SQLite, no sharding.** One bot process with a single-writer database is plenty for dozens of servers. Past a couple of thousand guilds Discord requires sharding, and a database server would be worth having.
- **The update timer is not installed by the deploy.** It needs `sudo` with a password, so the owner runs three commands once.
- **The local test database and the Pi database are separate.** Licenses issued while testing on my computer do not exist on the Pi.
- **The word filter is a last net,** not a moderation system.
- **The layout checks were ad-hoc scripts.** A committed Playwright run in CI would catch overflow and console errors on every push.
