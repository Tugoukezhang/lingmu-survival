// 风铃小镇 (T13): friendship, chatting, gifts, quests, the general store.
// Pure functions on the game state, no Phaser.
//
// state.town = { friend: { npc: 0–100 }, talkDay: { npc: day }, giftDay: { npc: day }, quests: { id: 'active' | 'done' },
//               giftWeek: { npc: { week, n } }, heartGifts: { npc: [3, 5] } }   (last two: docs/11 ②)
// state.recipes = [unlocked recipe ids]   (workbench recipes taught by residents)
import { NPCS, GIFT, TALK_GAIN, GIFTS_PER_WEEK, WEEK_DAYS, HEART_GIFTS } from '../data/npcs.js';
import { QUESTS, QUEST_BY_ID, SHOP, SHOP_BOOKS, BOOK_PRICE } from '../data/quests.js';
import { ITEMS } from '../data/items.js';
import { countOf, addItem, removeItem } from './inventory.js';
import { bagSlots } from './crafting.js';
import { mulberry32 } from './rng.js';
import { bump } from './guide.js';

export const townOf = (state) => (state.town = state.town ?? { friend: {}, talkDay: {}, giftDay: {}, quests: {} });
export const friendOf = (state, npc) => townOf(state).friend[npc] ?? 0;
const addFriend = (state, npc, n) => { const t = townOf(state); t.friend[npc] = Math.max(0, Math.min(100, friendOf(state, npc) + n)); return t.friend[npc]; };
export const hearts = (f) => Math.floor(f / 20);   // 0–5 hearts for the UI
export const weekOf = (day) => Math.floor((day - 1) / WEEK_DAYS) + 1;
// gifts still allowed for this resident this week
export function giftsLeft(state, npc) {
  const g = (townOf(state).giftWeek ?? {})[npc];
  return g && g.week === weekOf(state.day) ? Math.max(0, GIFTS_PER_WEEK - g.n) : GIFTS_PER_WEEK;
}

// Heart presents (3 and 5 hearts): the first one reached and not yet received.
// Returns { hearts, items, line } or null; { full: true } when the bag has no room (try again later).
export function claimHeartGift(state, npc) {
  const t = townOf(state), got = (t.heartGifts = t.heartGifts ?? {})[npc] ?? [];
  const h = hearts(friendOf(state, npc));
  const step = Object.keys(HEART_GIFTS[npc] ?? {}).map(Number).sort((a, b) => a - b).find((k) => k <= h && !got.includes(k));
  if (step == null) return null;
  const g = HEART_GIFTS[npc][step];
  const slots = bagSlots(state);
  const trial = state.inventory.map((s) => ({ ...s }));
  if (!Object.entries(g.items).every(([id, n]) => addItem(trial, id, n, slots))) return { full: true, hearts: step };
  for (const [id, n] of Object.entries(g.items)) addItem(state.inventory, id, n, slots);
  t.heartGifts[npc] = [...got, step];
  return { hearts: step, items: g.items, line: g.line };
}

// One line of dialogue; the first chat of the day gives +1 friendship.
export function talk(state, npc) {
  const n = NPCS[npc], t = townOf(state), f = friendOf(state, npc);
  const tier = f >= 60 ? 'high' : f >= 30 ? 'mid' : 'low';
  const rng = mulberry32((state.day * 131 + npc.length * 7) >>> 0);
  const line = n.lines[tier][Math.floor(rng() * n.lines[tier].length)];
  let gain = 0;
  if (t.talkDay[npc] !== state.day) { t.talkDay[npc] = state.day; gain = TALK_GAIN; addFriend(state, npc, gain); bump(state, 'talk'); }
  const present = claimHeartGift(state, npc);
  return { line: present && !present.full ? present.line : line, gain, present };
}

export function giftTaste(npc, itemId) {
  const n = NPCS[npc];
  return n.loves.includes(itemId) ? 'love' : n.likes.includes(itemId) ? 'like' : n.dislikes.includes(itemId) ? 'dislike' : 'neutral';
}

// Gift once per day and twice per week per resident. Tools can't be given.
export function gift(state, npc, itemId) {
  const t = townOf(state);
  if (t.giftDay[npc] === state.day) return { ok: false, reason: 'gifted' };
  if (giftsLeft(state, npc) <= 0) return { ok: false, reason: 'week' };
  if (!ITEMS[itemId] || ITEMS[itemId].tool) return { ok: false, reason: 'not-giftable' };
  if (!removeItem(state.inventory, itemId, 1)) return { ok: false, reason: 'none' };
  t.giftDay[npc] = state.day;
  const wk = weekOf(state.day), gw = (t.giftWeek = t.giftWeek ?? {});
  gw[npc] = gw[npc]?.week === wk ? { week: wk, n: gw[npc].n + 1 } : { week: wk, n: 1 };
  const taste = giftTaste(npc, itemId);
  const before = friendOf(state, npc);
  addFriend(state, npc, GIFT[taste]);
  bump(state, 'gift');
  return { ok: true, taste, gain: friendOf(state, npc) - before };
}

// ---------- quests ----------
export const questState = (state, id) => townOf(state).quests[id] ?? null;   // null | 'active' | 'done'

// Quests a resident can offer right now (not taken, not done, prerequisite done).
export const offers = (state, npc) => QUESTS.filter((q) => q.npc === npc && !questState(state, q.id) && (!q.after || questState(state, q.after) === 'done') && hearts(friendOf(state, npc)) >= (q.hearts ?? 0));
// The next quest that only waits for more hearts (for a hint in the resident panel).
export const heartLocked = (state, npc) => QUESTS.find((q) => q.npc === npc && !questState(state, q.id) && (!q.after || questState(state, q.after) === 'done') && hearts(friendOf(state, npc)) < (q.hearts ?? 0)) ?? null;
export const activeOf = (state, npc) => QUESTS.filter((q) => q.npc === npc && questState(state, q.id) === 'active');

export function accept(state, id) {
  const q = QUEST_BY_ID[id];
  if (!q || questState(state, id)) return { ok: false, reason: 'taken' };
  if (q.after && questState(state, q.after) !== 'done') return { ok: false, reason: 'locked' };
  if (hearts(friendOf(state, q.npc)) < (q.hearts ?? 0)) return { ok: false, reason: 'hearts' };
  townOf(state).quests[id] = 'active';
  return { ok: true };
}

// What is still missing to hand the quest in: [{ id, need, have }] or [{ party }].
export function missing(state, id) {
  const q = QUEST_BY_ID[id], out = [];
  for (const [item, n] of Object.entries(q.need)) {
    if (item === 'party') { if (!state.party.some((u) => state.pets.find((p) => p.uid === u)?.species === n)) out.push({ party: n }); continue; }
    const have = countOf(state.inventory, item);
    if (have < n) out.push({ id: item, need: n, have });
  }
  return out;
}

// Hand in: takes the items, gives the reward — exactly once.
export function complete(state, id) {
  const q = QUEST_BY_ID[id];
  if (questState(state, id) !== 'active') return { ok: false, reason: questState(state, id) === 'done' ? 'done' : 'not-active' };
  if (missing(state, id).length) return { ok: false, reason: 'missing' };
  const items = Object.entries(q.reward.items ?? {});
  const fresh = items.filter(([i]) => countOf(state.inventory, i) === 0).length;
  const freed = Object.entries(q.need).filter(([i, n]) => i !== 'party' && countOf(state.inventory, i) === n).length;
  if (state.inventory.length - freed + fresh > bagSlots(state)) return { ok: false, reason: 'full' };
  for (const [item, n] of Object.entries(q.need)) if (item !== 'party') removeItem(state.inventory, item, n);
  for (const [item, n] of items) addItem(state.inventory, item, n, Infinity);
  if (q.reward.clover) state.clover += q.reward.clover;
  if (q.reward.recipe && !(state.recipes ?? []).includes(q.reward.recipe)) state.recipes = [...(state.recipes ?? []), q.reward.recipe];
  if (q.reward.friend) addFriend(state, q.npc, q.reward.friend);
  townOf(state).quests[id] = 'done';
  bump(state, 'quests');
  return { ok: true, reward: q.reward };
}

// ---------- the general store ----------
export function stock(state) {
  const rng = mulberry32((state.seed * 17 + state.day * 389) >>> 0);
  const books = [...SHOP_BOOKS];
  const today = [books.splice(Math.floor(rng() * books.length), 1)[0], books.splice(Math.floor(rng() * books.length), 1)[0]];
  return [...SHOP, ...today.map((id) => ({ id, price: BOOK_PRICE }))];
}

export function buy(state, itemId, n = 1) {
  const entry = stock(state).find((s) => s.id === itemId);
  if (!entry) return { ok: false, reason: 'not-sold' };
  const cost = entry.price * n;
  if (state.clover < cost) return { ok: false, reason: 'clover' };
  if (!addItem(state.inventory, itemId, n, bagSlots(state))) return { ok: false, reason: 'full' };
  state.clover -= cost;
  return { ok: true, cost };
}
