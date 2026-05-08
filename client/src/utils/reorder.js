// Pure reorder helper used by drag-to-reorder UIs. Move `fromId` to the
// position of `toId`. If either id isn't in the list, return the input
// unchanged. Never mutates the input.

export function reorderIds(ids, fromId, toId) {
  if (!Array.isArray(ids)) return ids;
  if (fromId === toId) return ids.slice();
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return ids.slice();
  const next = ids.slice();
  const [moved] = next.splice(fromIdx, 1);
  // After splicing out fromIdx, positions at or after fromIdx shift left by 1.
  // We want `moved` to land at the position currently occupied by toId in the
  // new array — that's `next.indexOf(toId)`.
  const insertAt = next.indexOf(toId);
  next.splice(insertAt, 0, moved);
  return next;
}
