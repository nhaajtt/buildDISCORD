# Changelog

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
