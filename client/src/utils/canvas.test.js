import { describe, it, expect } from 'vitest';
import {
  newCanvas,
  addObject,
  removeObject,
  updateObject,
  getObject,
  createStroke,
  createRect,
  createCircle,
  createLine,
  createArrow,
  createTriangle,
  createText,
  bbox,
  hitTest,
} from './canvas.js';

describe('newCanvas', () => {
  it('creates an empty canvas with a default background', () => {
    expect(newCanvas()).toEqual({ objects: [], background: '#ffffff' });
  });

  it('accepts a custom background', () => {
    expect(newCanvas('#000000').background).toBe('#000000');
  });
});

describe('addObject / removeObject / updateObject / getObject', () => {
  it('addObject appends to objects and assigns an id when missing', () => {
    const c0 = newCanvas();
    const c1 = addObject(c0, createStroke({ points: [{ x: 0, y: 0 }] }));
    expect(c1.objects).toHaveLength(1);
    expect(c1.objects[0].id).toMatch(/^[a-zA-Z0-9_-]+$/);
    // Original canvas not mutated
    expect(c0.objects).toHaveLength(0);
  });

  it('addObject preserves an explicit id', () => {
    const c1 = addObject(newCanvas(), { ...createStroke(), id: 'fixed-id' });
    expect(c1.objects[0].id).toBe('fixed-id');
  });

  it('removeObject filters out the named id', () => {
    let c = newCanvas();
    c = addObject(c, { ...createStroke(), id: 'a' });
    c = addObject(c, { ...createStroke(), id: 'b' });
    c = removeObject(c, 'a');
    expect(c.objects.map((o) => o.id)).toEqual(['b']);
  });

  it('removeObject of an unknown id is a no-op', () => {
    let c = addObject(newCanvas(), { ...createStroke(), id: 'a' });
    const after = removeObject(c, 'zzz');
    expect(after.objects.map((o) => o.id)).toEqual(['a']);
  });

  it('updateObject merges patch but preserves id and kind', () => {
    let c = addObject(newCanvas(), {
      ...createStroke({ color: '#000', width: 2 }),
      id: 'a',
    });
    c = updateObject(c, 'a', { color: '#f00', id: 'hacked', kind: 'rect' });
    expect(c.objects[0].id).toBe('a');
    expect(c.objects[0].kind).toBe('stroke');
    expect(c.objects[0].color).toBe('#f00');
    expect(c.objects[0].width).toBe(2); // preserved
  });

  it('getObject returns the object by id or null', () => {
    const c = addObject(newCanvas(), { ...createStroke(), id: 'a' });
    expect(getObject(c, 'a').id).toBe('a');
    expect(getObject(c, 'zzz')).toBeNull();
  });
});

describe('createStroke', () => {
  it('produces a stroke with sane defaults', () => {
    const s = createStroke();
    expect(s.kind).toBe('stroke');
    expect(s.points).toEqual([]);
    expect(s.color).toMatch(/^#/);
    expect(s.width).toBeGreaterThan(0);
    expect(s.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('accepts overrides', () => {
    const s = createStroke({ points: [{ x: 1, y: 2 }], color: '#abcdef', width: 5 });
    expect(s.points).toEqual([{ x: 1, y: 2 }]);
    expect(s.color).toBe('#abcdef');
    expect(s.width).toBe(5);
  });
});

describe('bbox', () => {
  it('returns the axis-aligned bounding box of a stroke', () => {
    const s = createStroke({
      points: [
        { x: 5, y: 7 },
        { x: 12, y: 4 },
        { x: 9, y: 20 },
      ],
    });
    expect(bbox(s)).toEqual({ x: 5, y: 4, w: 7, h: 16 });
  });

  it('returns a zero box for an empty stroke', () => {
    expect(bbox(createStroke())).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('throws for unknown kinds', () => {
    expect(() => bbox({ kind: 'mystery' })).toThrow(/unknown.*kind/i);
  });
});

describe('hitTest', () => {
  it('hits a point on a stroke segment within tolerance', () => {
    const s = createStroke({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      width: 4,
    });
    const c = addObject(newCanvas(), { ...s, id: 'a' });

    expect(hitTest(c, 5, 1)).toBe('a'); // on the line
    expect(hitTest(c, 5, 100)).toBeNull(); // far away
  });

  it('does not hit far points outside the tolerance', () => {
    const s = createStroke({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      width: 2,
    });
    const c = addObject(newCanvas(), { ...s, id: 'a' });
    expect(hitTest(c, 5, 50)).toBeNull();
  });

  it('returns the topmost (latest-added) object when several overlap', () => {
    const a = createStroke({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], width: 4 });
    const b = createStroke({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], width: 4 });
    let c = newCanvas();
    c = addObject(c, { ...a, id: 'lower' });
    c = addObject(c, { ...b, id: 'upper' });
    expect(hitTest(c, 5, 0)).toBe('upper');
  });

  it('returns null on an empty canvas', () => {
    expect(hitTest(newCanvas(), 5, 5)).toBeNull();
  });
});

describe('rect', () => {
  it('createRect produces a rectangle with sane defaults', () => {
    const r = createRect({ x: 10, y: 20, w: 30, h: 40 });
    expect(r.kind).toBe('rect');
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
    expect(r.w).toBe(30);
    expect(r.h).toBe(40);
    expect(r.stroke).toMatch(/^#/);
    expect(r.fill).toBe('transparent');
    expect(r.strokeWidth).toBeGreaterThan(0);
    expect(r.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('createRect accepts overrides for stroke/fill/strokeWidth', () => {
    const r = createRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      stroke: '#abcdef',
      fill: '#ff0',
      strokeWidth: 4,
    });
    expect(r.stroke).toBe('#abcdef');
    expect(r.fill).toBe('#ff0');
    expect(r.strokeWidth).toBe(4);
  });

  it('bbox of a rect is its own dimensions', () => {
    expect(bbox(createRect({ x: 5, y: 7, w: 30, h: 50 }))).toEqual({ x: 5, y: 7, w: 30, h: 50 });
  });

  it('hitTest is true for points inside the rect', () => {
    const c = addObject(newCanvas(), { ...createRect({ x: 10, y: 10, w: 20, h: 30 }), id: 'r' });
    expect(hitTest(c, 15, 15)).toBe('r');
    expect(hitTest(c, 29, 39)).toBe('r'); // near far corner
    expect(hitTest(c, 10, 10)).toBe('r'); // on near corner
  });

  it('hitTest is null for points outside the rect', () => {
    const c = addObject(newCanvas(), { ...createRect({ x: 10, y: 10, w: 20, h: 30 }), id: 'r' });
    expect(hitTest(c, 5, 5)).toBeNull();
    expect(hitTest(c, 100, 100)).toBeNull();
    expect(hitTest(c, 15, 50)).toBeNull(); // below
  });

  it('topmost rect wins when overlapping', () => {
    let c = newCanvas();
    c = addObject(c, { ...createRect({ x: 0, y: 0, w: 50, h: 50 }), id: 'lower' });
    c = addObject(c, { ...createRect({ x: 0, y: 0, w: 50, h: 50 }), id: 'upper' });
    expect(hitTest(c, 25, 25)).toBe('upper');
  });
});

describe('circle', () => {
  it('createCircle has sane defaults', () => {
    const c = createCircle({ cx: 50, cy: 50, r: 20 });
    expect(c.kind).toBe('circle');
    expect(c).toMatchObject({ cx: 50, cy: 50, r: 20 });
    expect(c.stroke).toMatch(/^#/);
    expect(c.fill).toBe('transparent');
    expect(c.strokeWidth).toBeGreaterThan(0);
  });

  it('bbox of a circle is the inscribing square', () => {
    expect(bbox(createCircle({ cx: 50, cy: 60, r: 10 }))).toEqual({
      x: 40,
      y: 50,
      w: 20,
      h: 20,
    });
  });

  it('hitTest is true inside the disk and false outside', () => {
    const c = addObject(newCanvas(), { ...createCircle({ cx: 50, cy: 50, r: 10 }), id: 'c' });
    expect(hitTest(c, 50, 50)).toBe('c'); // center
    expect(hitTest(c, 55, 55)).toBe('c'); // inside
    expect(hitTest(c, 50, 60)).toBe('c'); // on edge
    expect(hitTest(c, 100, 100)).toBeNull();
    expect(hitTest(c, 50, 70)).toBeNull(); // outside radius
  });
});

describe('line', () => {
  it('createLine has sane defaults', () => {
    const l = createLine({ x1: 0, y1: 0, x2: 100, y2: 50 });
    expect(l.kind).toBe('line');
    expect(l).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 50 });
    expect(l.stroke).toMatch(/^#/);
    expect(l.strokeWidth).toBeGreaterThan(0);
  });

  it('bbox is min/max of endpoints', () => {
    expect(bbox(createLine({ x1: 50, y1: 80, x2: 10, y2: 30 }))).toEqual({
      x: 10,
      y: 30,
      w: 40,
      h: 50,
    });
  });

  it('hitTest hits along the segment', () => {
    const c = addObject(newCanvas(), {
      ...createLine({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 }),
      id: 'l',
    });
    expect(hitTest(c, 50, 1)).toBe('l');
    expect(hitTest(c, 50, 100)).toBeNull();
  });
});

describe('arrow', () => {
  it('createArrow shares line geometry', () => {
    const a = createArrow({ x1: 0, y1: 0, x2: 50, y2: 50 });
    expect(a.kind).toBe('arrow');
    expect(a).toMatchObject({ x1: 0, y1: 0, x2: 50, y2: 50 });
  });

  it('bbox and hitTest behave like line', () => {
    const c = addObject(newCanvas(), {
      ...createArrow({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 }),
      id: 'a',
    });
    expect(bbox({ ...createArrow({ x1: 0, y1: 0, x2: 100, y2: 0 }) })).toEqual({
      x: 0, y: 0, w: 100, h: 0,
    });
    expect(hitTest(c, 50, 1)).toBe('a');
  });
});

describe('triangle', () => {
  it('createTriangle has sane defaults (bbox-based)', () => {
    const t = createTriangle({ x: 10, y: 20, w: 40, h: 30 });
    expect(t.kind).toBe('triangle');
    expect(t).toMatchObject({ x: 10, y: 20, w: 40, h: 30 });
    expect(t.fill).toBe('transparent');
  });

  it('bbox returns the bounding box', () => {
    expect(bbox(createTriangle({ x: 0, y: 0, w: 60, h: 40 }))).toEqual({
      x: 0, y: 0, w: 60, h: 40,
    });
  });

  it('hitTest covers the inscribed triangle (apex top-center)', () => {
    // Triangle: apex (50, 0), base (0, 100) to (100, 100)
    const c = addObject(newCanvas(), {
      ...createTriangle({ x: 0, y: 0, w: 100, h: 100 }),
      id: 't',
    });
    expect(hitTest(c, 50, 5)).toBe('t'); // near apex
    expect(hitTest(c, 50, 99)).toBe('t'); // near base center
    expect(hitTest(c, 5, 95)).toBe('t'); // near base-left
    expect(hitTest(c, 5, 5)).toBeNull(); // top-left corner of bbox, outside triangle
    expect(hitTest(c, 95, 5)).toBeNull(); // top-right corner of bbox, outside triangle
  });
});

describe('text', () => {
  it('createText has sane defaults', () => {
    const t = createText({ x: 10, y: 20, text: 'hello' });
    expect(t.kind).toBe('text');
    expect(t).toMatchObject({ x: 10, y: 20, text: 'hello' });
    expect(t.color).toMatch(/^#/);
    expect(t.fontSize).toBeGreaterThan(0);
  });

  it('bbox is approximate based on fontSize × text length', () => {
    const t = createText({ x: 0, y: 0, text: 'abc', fontSize: 20 });
    const b = bbox(t);
    expect(b.x).toBe(0);
    expect(b.h).toBe(20);
    expect(b.w).toBeGreaterThan(0);
  });

  it('hitTest uses the bounding box', () => {
    const c = addObject(newCanvas(), {
      ...createText({ x: 100, y: 100, text: 'hi', fontSize: 20 }),
      id: 't',
    });
    expect(hitTest(c, 105, 105)).toBe('t');
    expect(hitTest(c, 0, 0)).toBeNull();
  });
});

describe('JSON round-trip', () => {
  it('survives JSON.stringify -> JSON.parse', () => {
    let c = newCanvas('#eef');
    c = addObject(c, createStroke({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: '#abc', width: 3 }));
    const round = JSON.parse(JSON.stringify(c));
    expect(round).toEqual(c);
  });
});
