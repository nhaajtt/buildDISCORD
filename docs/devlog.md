# Devlog

Short notes on why this project exists and what went wrong while building it.

## 2 Oct 2026: why a bot that builds servers

Every new Discord server starts the same way: an empty list with one channel called `general`. Setting up roles, channels, rules and a welcome takes an hour, and most people give up halfway. I already run a music bot and a bot that keeps a channel lively, so the missing piece was the first hour. The idea: add one bot to an empty server, type one command and get a server that already has a personality. The personality is the point. Rules like "no ads, if you could really get rich in three days you would not be sitting here" are what make people read them.

## What I learned

- **A bot cannot add another bot.** I wanted the new server to come with a music bot and a text-to-speech bot. Discord only lets a person invite a bot, through the OAuth page. So the builder makes the DJ booth, the karaoke room and the text-to-speech channel, and posts an invite button for the bots I configure. An admin clicks once. It is less magic than I wanted and exactly as much as the platform allows.
- **Preview first, always.** The first version asked "build it?" with two buttons. That was not enough: people want to drop one category or rename another before anything exists. The blueprint is now a tree you can edit with a select menu, a modal and a few buttons, and it expires after 15 minutes so nothing half-edited lingers.
- **Running it twice must not make a mess.** Early on, running `/build` again created a second copy of every channel and posted the rules twice. The fix was to make creation return whether it created something, and only fill a channel with content if it did. The test builds a server, builds it again and counts.
- **Undo only what you made.** `/nuke` deletes by the IDs the bot recorded, never by name. The same record limits the self-assign role buttons: a button for a role the bot did not record is refused, so a forged button cannot hand out an admin role.
- **Rate limits are a design input.** A server with thirty channels is a hundred API calls. A small pause between creations and one progress message that is edited in place (rather than a new message each step) keeps it calm.

## Mixing themes and plans

- **Merging, not concatenating.** Mixing "study", "gaming" and "chill" produced three channels called `meme` and three called `fighting`. Merging by name, dropping empty categories and keeping the admin area first fixed it. The mix test checks that no channel or category name repeats and that the result stays inside Discord's limits (500 channels, 250 roles).
- **JSON files were fine until there were customers.** Per-server JSON files worked for one test server. Licenses, usage counters and a monthly AI quota want transactions, so it moved to the SQLite module that ships with Node 22. The old files are imported on first start and renamed, not deleted.
- **A license is just a row.** One-time codes with no ambiguous characters, a plan per server, the highest active plan wins, and a second code of the same plan adds its days after the current expiry. Every rule has a test with a fake clock.
- **I almost published my customers' database.** The `.gitignore` covered `data/*.json` but not the new `.db` file. I caught it while preparing this repository and ignored the whole `data/` folder. A reminder that a data format change is also a change to what could leak.

## The AI designer

- **Free tier, no model name needed.** I use Google's free Gemini API. Model names and free limits change often, so the bot asks Google which models the key can use and picks the newest stable "flash" one, instead of hard coding a name. The first real call picked one I had never heard of, which is exactly why it is not hard coded.
- **Never build straight from a model's answer.** The reply is forced into a JSON schema, then cleaned: mentions and `@everyone` removed, blocked words dropped, counts and lengths capped, colors parsed with a fallback, and the welcome forced to contain `{user}`. Only then does it reach the editable blueprint, so a person always sees it before it exists.
- **A regex that passed by accident.** The word filter uses `\b`, which in JavaScript only knows ASCII letters, so it never matched Vietnamese words with diacritics. My first fix wrote the pattern in a normal template string, where `\p{L}` silently loses its backslash, and the test still passed because of how the sample was spaced. Testing words that merely contain a blocked one ("bạn đụng xe", "Essex club") caught it, and `String.raw` fixed it.
- **The description is data.** It goes in the user message, never into the system prompt, and the system prompt says to ignore instructions inside it. A test checks where the text ends up.
- **Quota is shared by every customer.** One free key serves every server, so there is a per-server monthly limit and a bot-wide limit per minute. When Google says no, the person gets a plain message and the attempt is not counted against them.
- **Say where the data goes.** On the free tier Google may use what is sent to improve its products. The privacy page says so, and the README repeats it.

## The website

- **One memorable thing.** The page is a blueprint sheet in navy with one safety-orange accent. The only big motion is a pinned scene where a server assembles itself as you scroll: roles first, then categories and channels, then the rules card and a "signed off" stamp.
- **Words without a mask clip.** Split headings rise letter by letter inside overflow masks. The masks clipped accents on Vietnamese capitals until I gave each word some vertical padding and a looser line height.
- **A font name that does not exist.** I used "Big Shoulders Display" from memory and `next/font` refused it. The family is called "Big Shoulders".
- **Mobile cannot pin everything.** On a phone the pinned scene has no room for the heading, so it stays for screen readers only and the scene keeps the step text and the tree. With reduced motion on, nothing pins and every step shows in full.
- **Honest blank states.** The invite buttons scroll to the setup section until a real invite link is set, instead of pointing nowhere.

## Safe to leave alone

- **Alerts that cannot flood.** Errors go to a webhook, but the same message is sent at most once every five minutes, so a crash loop cannot bury the channel.
- **A health check that means something.** The bot writes a heartbeat file every 30 seconds and the container's health check reads its age. The update script waits for "healthy", not just "running", and rolls back if it never gets there.
- **Daily copies of the database**, seven kept, written with `VACUUM INTO` so the copy is consistent while the bot is running.
