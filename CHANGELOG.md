# Changelog

## 1.5.0

- **Welcome flow** with an optional verify button and starter role. `/chaomung`.
- **Server health check** with a score, explanations and safe fixes. `/khamsuckhoe`.
- **AutoMod** through Discord's native rules, three levels. `/automod`.
- **Tickets** as private channels with automatic closing. `/ticket`.
- **Web dashboard** with Discord sign-in, running inside the bot.
- **Trial**: `/dungthu` gives a server seven days of Pro, once. Free-plan welcomes carry a small credit line.
- **Unlocked servers**: `UNLOCKED_GUILD_IDS` gives chosen servers every feature without a license.

## 1.4.0

- **Humor levels** (gentle, troll, absurd) for every built-in theme and for saved themes, in `/build` and `/theme dung`. The level changes words, never structure.
- **Saved themes**: save a blueprint from the editor, reuse it, export it and import it. `/theme`.
- **Backup and restore** of a server's layout with safe, create-only restore and strict import validation. `/backup`.
- **Check-in, levels, leaderboard and mini-games** (guess the number, rock paper scissors, trivia). `/diemdanh`, `/bangxephang`, `/doanso`, `/thachdau`, `/cauhoi`.
- **Recurring events** with Discord scheduled events and announcements. `/sukien`.
- **Automatic payments** through payOS: `/mua` creates a payment link, a job polls open orders and switches the plan on when the money arrives. `/admin donhang` lists recent orders.
- A job registry (`src/jobs.js`) and a router that lets a command own its buttons, menus, modals and autocomplete.
- Plan limits for the new features and an updated `/goi`.
- Fixed `/build` crashing because a variable shadowed the lines module; handlers are now driven in tests with fake interactions (128 tests).
- The website: an after-the-build section, the full command list, payment steps, a privacy page that lists what the new features store, and deployment from Git.

## 1.3.0

- Seven new themes, eleven in total: **Booking Bạn Chơi** (a server for booking a friend to play or talk, with a booking guide, price list, player profiles, free slots, feedback, anti-scam and complaints channels), anime fans, coders, content creators, cinema and music, an office team, and pet lovers.
- Trust roles in the booking theme (verified player, popular player, regular customer) are handed out by staff and are not in the self-assign picker.
- Tests for every mix of up to four themes (561): Discord limits, no role key or name shared between themes, no permissions on self-assignable roles.
- The website shows all eleven themes, caps a mix at four like `/build`, and merges themes in the browser with a port of the bot's merge that a test checks against the bot for every mix.
- Fixed the command list scrolling sideways on phones.

## 1.2.0

- Interactive website: a drafting table in the hero that shows the bot's real output for every mix of themes, a working miniature of the blueprint editor, three real AI answers, plan cards, copyable commands, a drafting crosshair and a scroll ruler, in a brighter blueprint style. Reduced motion, touch and no-script all have plain fallbacks.
- The devlog page renders `docs/devlog.md`, with contents, copy buttons and figure cards. The devlog itself is now a full technical write-up.
- Website data comes from the bot (`scripts/export-web-data.js`, `scripts/sample-designs.js`) and a test fails when it goes stale.
- Build pacing is configurable (`BUILD_STEP_DELAY_MS`) and the test suite went from about 38 seconds to about 2.5.
- A build that fails halfway now saves what it created, so `/nuke` can clean it up.
- A Google 5xx answer is retried with a pause and reported as "unavailable" instead of "unusable".

## 1.1.0

- Website live at builddiscord.vercel.app, with plan prices in US dollars ($9.99 and $19.99 per 30 days), Instagram and website contact links, and a refund rule in the terms.
- Website finished: sections for the AI designer (with a real example answer) and the editable blueprint, a plans section with how to buy a code, all seven customer commands, an updated FAQ, a devlog page in both languages, and a working invite button.

## 1.0.0

- `/build` with one to four mixed themes (late-night gamers, studying without studying, general-store community, chill with the crew), an editable blueprint (remove or rename a category, add a channel) and a confirmation before anything is created.
- `/thietke`: a server designed by Google Gemini from a short description, with three humor levels. The answer is cleaned and always shown as an editable blueprint first.
- `/nuke`, `/roast`, `/goi`, `/kichhoat`, `/xoadulieu` and the owner-only `/admin`.
- Plans per server (free, Pro, Plus) activated with one-time codes; `npm run license` makes and lists codes.
- SQLite storage with an automatic import of the first version's JSON files, and a daily database copy.
- Health check, error alerts to a webhook, and a Raspberry Pi installer with a daily self-update that rolls back when the new version is not healthy.
- A bilingual landing page (Next.js) with privacy and terms pages.
