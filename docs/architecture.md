# Architecture

buildDISCORD is one Node process with one bot account. The design goal: everything interesting (merging themes, plans, licenses, cleaning an AI answer, editing a blueprint) lives in plain modules that never touch Discord, so it can be tested without a network. The files that know about Discord are the command files, `src/ui/editor.js`, `src/builder.js` and the event handlers.

```mermaid
flowchart LR
  subgraph Discord
    G[Gateway: slash commands, buttons, menus, modals]
  end
  subgraph Handlers
    C[commands/*.js]
    E[ui/editor.js<br/>blueprint view + edits]
    B[builder.js<br/>creates roles, channels, content]
  end
  subgraph Pure modules
    T[themes/<br/>four themes + composePlan]
    BP[blueprints.js<br/>plan being edited, 15 min]
    AI[ai/<br/>gemini.js, designer.js, validate.js]
    L[license.js + utils/gate.js]
    DB[(SQLite: guilds, licenses, usage)]
  end
  G <--> C
  G <--> E
  C --> T
  C --> AI
  C --> L
  C --> E
  E --> BP
  E --> B
  B --> T
  B --> DB
  L --> DB
  AI -->|HTTPS| Gemini[(Google Gemini API)]
```

## From a command to a server

1. `/build` merges the chosen themes into one **plan** with `composePlan`: shared parts first (admin area), then each theme's categories, then the DJ rooms and the mod-only area. Channels and categories with the same name appear once.
2. `/thietke` asks Gemini for a theme-shaped JSON, cleans it with `sanitizeDesign` and merges it with the same shared parts, so an AI server always has rules, welcome, role picker, DJ booth and a text-to-speech channel.
3. The plan becomes a **blueprint** held in memory for 15 minutes. `ui/editor.js` renders it as a tree with a select menu to remove a category, another to rename one, and buttons to add a channel, build or cancel. Only the person who started it, and only an administrator, can touch it.
4. **Build** runs `builder.js`: roles, then categories and channels (with permission overwrites for the mod-only area and read-only channels), then it posts the rules, welcome, role picker and the two invite buttons into the channels it just created. Each step edits one progress message. A lock stops two builds from running in the same server.
5. Every created ID is saved. `/nuke` deletes by those IDs, and the role buttons only grant roles in that list.

## Data

SQLite through the module built into Node 22 (`src/db.js`).

| Table | Holds |
| --- | --- |
| `guilds` | per server: theme, and IDs of created roles, categories and channels |
| `licenses` | one row per code: plan, days, who redeemed it, expiry |
| `usage` | per server and month (or lifetime): counters for builds and AI designs |

A plan is derived, not stored: the highest-ranked license that has not expired, else free. Limits live in one table in `src/license.js`, and `utils/gate.js` turns them into refusals with a plain message.

## AI

`ai/gemini.js` talks to Google's REST API with `fetch`, sends the key in a header (never in the URL), asks for JSON that follows a schema, and picks a model by listing what the key can use. It caps the whole bot at ten requests a minute. `ai/validate.js` is the safety net: it never trusts the answer, it cleans it. A failed or unusable answer is retried once; if it still fails the person gets a message and the attempt is not counted.

## Running it

The Docker image runs `node src/index.js`. The bot writes `data/heartbeat` every 30 seconds, which is what the image's health check reads. `data/` is a mounted volume holding the database and the daily copies. On the Raspberry Pi a systemd timer runs `scripts/update.sh` daily: fast-forward only, rebuild, wait for healthy, roll back otherwise.
