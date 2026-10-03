import type { Dict } from "./types";

const en: Dict = {
  lang: "en",
  meta: {
    title: "Thau Xay Dung, the Discord bot that builds a whole server in one command",
    description:
      "Invite the bot to an empty server, run /build, and minutes later you have channels, roles, rules and a welcome. All of it ridiculous. Channel names stay in Vietnamese.",
  },
  nav: { how: "How it builds", themes: "Blueprints", commands: "Commands", faq: "FAQ", cta: "Invite the contractor", switchTo: "VI", switchHref: "/", theme: "Toggle light and dark theme", home: "Back to top" },
  hero: {
    title: "Your server is as empty as a wallet at month's end.",
    sub: "Invite the contractor and run /build. A few minutes later your server has channels, roles, rules and some loving insults. Not inspected yet, but go ahead and use it.",
    cta: "Invite the contractor",
    secondary: "Watch the construction",
    commandLabel: "Blueprint waiting for a command",
    empty: "No channels yet. No rules yet. Nobody to argue with yet.",
  },
  scene: {
    title: "From bare ground to a finished server.",
    steps: [
      { t: "Call the contractor", d: "An admin runs /build and picks a theme. The bot posts a blueprint for approval first and touches nothing yet." },
      { t: "Pour the role foundation", d: "A Chairman, Mods, a Slave Bot and a few self-assign roles, each with a name nobody will admit to choosing." },
      { t: "Raise the channels", d: "Categories, text channels, voice rooms, and mod-only channels only mods can see. Announcement and rules channels are locked to read-only." },
      { t: "Post the rules", d: "Rules, a welcome and a role-picker with buttons land in the right channels. The DJ and text-to-speech rooms come with invite buttons." },
      { t: "Sign-off", d: "Done. Running /build again creates no duplicates, and /nuke removes exactly what the bot built." },
    ],
    cmd: "/build theme: Game Thủ Cày Đêm",
    roles: "Roles",
    rules: "Server rules",
    stamp: "Signed off",
    done: "done",
  },
  themes: {
    title: "Pick a blueprint.",
    sub: "Four themes. The shared part (admin area, DJ rooms, mod backstage) comes with every one.",
    items: [
      { id: "gaming", label: "Late-Night Gamers", blurb: "For gaming crews: a team finder, a clip showcase and a place to cry after a loss." },
      { id: "hoc-tap", label: "Studying Without Studying", blurb: "For study groups: homework help, burning deadlines, an exam-eve room." },
      { id: "cong-dong", label: "General Store Community", blurb: "For any community: chatter, photo sharing, events and assorted odds and ends." },
      { id: "chill-ban-be", label: "Chill With the Crew", blurb: "For close friends: an archive of each other's bad photos and plans nobody follows." },
    ],
    rolesLabel: "Sample roles",
    channelsLabel: "Theme-only channels",
    sharedLabel: "Shared by every theme",
    tablist: "Choose a theme",
  },
  rules: {
    title: "Rules nobody reads, but everyone gets reminded of.",
    sub: "Eight shared rules plus two per theme, posted into the rules channel. A few samples (in Vietnamese, as the bot writes them):",
  },
  music: {
    title: "What about music and text-to-speech?",
    body: "Discord does not let a bot invite another bot, only a person can. So the contractor does what it can: it builds the DJ room, the karaoke room and the text-to-speech room, and puts an invite button for a music bot and a TTS bot right in the channel. An admin clicks once and the music starts.",
    points: ["#dj-booth has a music bot invite button", "#chém-gió-bằng-giọng has a TTS bot invite button", "You configure the bot links, the contractor just places the buttons"],
  },
  commands: {
    title: "Three commands, no more.",
    items: [
      { name: "/build", args: "theme", d: "Builds the server from a theme. Shows a blueprint preview with a confirm button. Admins only." },
      { name: "/nuke", args: "", d: "Tears down what the bot built. Only touches channels and roles the bot created, with a confirm button." },
      { name: "/roast", args: "nguoi", d: "Gently roasts a member for fun. Cannot mod, cannot mute, can only offend." },
    ],
  },
  faq: {
    title: "FAQ",
    items: [
      { q: "What permissions does it need?", a: "Whoever runs the command needs Administrator. The bot needs Manage Channels, Manage Roles and Manage Server. The easy way is to invite it with Administrator." },
      { q: "Will it delete my existing channels?", a: "No. /build only adds, and channels with the same name are skipped. /nuke only removes what the bot itself created." },
      { q: "Does running /build twice create duplicates?", a: "No. What exists is skipped, and content like rules and the welcome is not posted again." },
      { q: "What does the bot store about my server?", a: "Only the IDs of the channels and roles it created, so /nuke knows what to remove and the role buttons only grant those roles." },
      { q: "Why does the music not come automatically?", a: "Because Discord forbids bots from inviting bots. The contractor puts the invite button in the DJ channel and you click it once." },
    ],
  },
  cta: {
    title: "Your server has waited long enough.",
    steps: ["Invite the contractor to your server (Administrator is easiest)", "Run /build, pick a theme, check the blueprint", "Hit build and go make coffee"],
    button: "Invite the contractor",
    note: "The button works once a real bot invite link is configured. Until then it scrolls back here.",
    setupId: "setup",
  },
  footer: {
    word: "BUILT IT",
    privacy: "Privacy",
    terms: "Terms",
    line: "A personal project, not affiliated with Discord. Ridiculous construction, no warranty.",
  },
};

export default en;
