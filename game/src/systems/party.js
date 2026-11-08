// Party management (T07; docs/02 第 6 节: party max 3, the rest live in the
// home pet house). Pure functions on the game state.
// On an expedition only the order can change: pets at home aren't there, and
// party members can't be sent home mid-trip 【建议】.
import { PARTY_MAX } from './battle.js';
import { bagSlots } from './crafting.js';
import { settleOverflow } from './explore.js';

export const inParty = (state, uid) => state.party.includes(uid);
const away = (state) => state.player.area !== 'home';

// Returns { ok } or { ok: false, reason: 'full' | 'away' | 'in-party' | 'unknown' }.
export function joinParty(state, uid) {
  if (!state.pets.some((p) => p.uid === uid)) return { ok: false, reason: 'unknown' };
  if (inParty(state, uid)) return { ok: false, reason: 'in-party' };
  if (away(state)) return { ok: false, reason: 'away' };
  if (state.party.length >= PARTY_MAX) return { ok: false, reason: 'full' };
  state.party.push(uid);
  return { ok: true };
}

// reason: 'last' (party can't be empty) | 'away' | 'not-in-party'
export function leaveParty(state, uid) {
  if (!inParty(state, uid)) return { ok: false, reason: 'not-in-party' };
  if (away(state)) return { ok: false, reason: 'away' };
  if (state.party.length <= 1) return { ok: false, reason: 'last' };
  state.party = state.party.filter((u) => u !== uid);
  // the bag may shrink (驮运 pet left): extra stacks go to the home storage, never lost
  const moved = settleOverflow(state, bagSlots(state));
  return { ok: true, moved };
}

// The leader goes first in battle and follows right behind the player.
export function setLead(state, uid) {
  if (!inParty(state, uid)) return { ok: false, reason: 'not-in-party' };
  state.party = [uid, ...state.party.filter((u) => u !== uid)];
  return { ok: true };
}
