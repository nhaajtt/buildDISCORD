// Pure handling of the server's own blocked words. Nothing here talks to Discord.

export const WORD_MAX = 60;
export const LIST_MAX = 500;
export const KEY = "custom";
const MIN_LETTERS = 2;

// Control and invisible formatting characters (zero width, direction marks) have no place in a word
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const LINKISH = /(?:https?:\/\/|\bwww\.|discord(?:app)?\.(?:gg|com)|dsc\.gg|\w\.(?:com|net|org|vn|gg|io|me|xyz)(?:\/|$))/i;
const MENTION = /<[@#:a][^>]*>|@everyone|@here|<\/|<!/i;

// One typed word to its stored form, or the reason it was refused
export function cleanWord(raw) {
  const word = String(raw ?? "")
    .replace(INVISIBLE, (c) => (/\s/.test(c) ? " " : ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!word) return { skip: true };
  if (MENTION.test(word)) return { word, reason: "mention" };
  if (LINKISH.test(word)) return { word, reason: "link" };
  if (word.length > WORD_MAX) return { word: word.slice(0, 20), reason: "long" };
  // A word made only of wildcards, or with a single letter, would hit nearly every message
  if (word.replace(/\*/g, "").length < MIN_LETTERS) return { word, reason: "short" };
  return { word };
}

// "a, b, c" into stored words. Duplicates inside one entry collapse. Returns the usable words and the refused ones.
export function parseWords(raw) {
  const words = [];
  const refused = [];
  const seen = new Set();
  for (const part of String(raw ?? "").slice(0, 5000).split(/[,\n]/)) {
    const result = cleanWord(part);
    if (result.skip) continue;
    if (result.reason) refused.push({ word: result.word.slice(0, 30), reason: result.reason });
    else if (!seen.has(result.word)) {
      seen.add(result.word);
      words.push(result.word);
    }
  }
  return { words, refused };
}

// Adds words to a stored list within `limit`. Reports what was added, already there, and left out for lack of room.
export function addWords(list, incoming, limit) {
  const have = new Set(list);
  const cap = Math.min(limit, LIST_MAX);
  const next = [...list];
  const added = [];
  const already = [];
  const noRoom = [];
  for (const word of incoming) {
    if (have.has(word)) already.push(word);
    else if (next.length >= cap) noRoom.push(word);
    else {
      have.add(word);
      next.push(word);
      added.push(word);
    }
  }
  return { list: next, added, already, noRoom };
}

export function removeWords(list, incoming) {
  const drop = new Set(incoming);
  return { list: list.filter((w) => !drop.has(w)), removed: list.filter((w) => drop.has(w)) };
}

export const PAGE_SIZE = 40;
export const pageCount = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));
export const pageOf = (list, page) => {
  const last = pageCount(list.length) - 1;
  const at = Math.min(Math.max(0, Number.isInteger(page) ? page : 0), last);
  return { page: at, pages: last + 1, items: list.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE) };
};
