import { describe, it, expect } from 'vitest';
import { reorderIds } from './reorder.js';

describe('reorderIds', () => {
  it('moves an id forward (drops at the target slot, pushing it down)', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'a', 'c', 'd']);
  });

  it('moves an id backward (drops at the target slot, pushing it up)', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op when moving onto itself', () => {
    expect(reorderIds(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c']);
  });

  it('returns the original order when fromId is missing', () => {
    expect(reorderIds(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });

  it('returns the original order when toId is missing', () => {
    expect(reorderIds(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
  });

  it('preserves the original array (does not mutate)', () => {
    const original = ['a', 'b', 'c'];
    reorderIds(original, 'a', 'c');
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
