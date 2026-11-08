// Inventory helpers. The inventory is a list of stacks [{ id, count }] in the
// save; order = order shown in the bag. Pure functions, no Phaser.
export const BAG_SLOTS = 20; // docs/02 第 9 节: 20 slots (+4 with 冰蓝小狼, 28 with the big bag)

export const countOf = (inv, id) => inv.reduce((n, s) => n + (s.id === id ? s.count : 0), 0);

// Adds n items (one stack per item id). Returns false when a new stack would not fit.
export function addItem(inv, id, n = 1, slots = BAG_SLOTS) {
  if (n <= 0) return true;
  const s = inv.find((x) => x.id === id);
  if (s) { s.count += n; return true; }
  if (inv.length >= slots) return false;
  inv.push({ id, count: n });
  return true;
}

// Removes n items. Returns false (and changes nothing) when there are not enough.
export function removeItem(inv, id, n = 1) {
  if (countOf(inv, id) < n) return false;
  const i = inv.findIndex((x) => x.id === id);
  inv[i].count -= n;
  if (inv[i].count <= 0) inv.splice(i, 1);
  return true;
}
