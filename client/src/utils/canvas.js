// Pure data model for canvas slides.
// Objects are plain JSON; rendering and hit-testing are dispatched per `kind`
// via the handler registry below. To add a new shape, register a new handler.

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `obj_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

const HANDLERS = new Map();

function registerHandler(kind, handler) {
  HANDLERS.set(kind, handler);
}

function handlerFor(kind) {
  const h = HANDLERS.get(kind);
  if (!h) throw new Error(`Unknown object kind: ${kind}`);
  return h;
}

export function newCanvas(background = '#ffffff') {
  return { objects: [], background };
}

export function addObject(content, obj) {
  const withId = { ...obj, id: obj.id ?? generateId() };
  return { ...content, objects: [...content.objects, withId] };
}

export function removeObject(content, id) {
  return { ...content, objects: content.objects.filter((o) => o.id !== id) };
}

export function updateObject(content, id, patch) {
  return {
    ...content,
    objects: content.objects.map((o) =>
      o.id === id ? { ...o, ...patch, id: o.id, kind: o.kind } : o,
    ),
  };
}

export function getObject(content, id) {
  return content.objects.find((o) => o.id === id) ?? null;
}

export function bbox(obj) {
  return handlerFor(obj.kind).bbox(obj);
}

export function hitTest(content, x, y) {
  for (let i = content.objects.length - 1; i >= 0; i--) {
    const obj = content.objects[i];
    const handler = HANDLERS.get(obj.kind);
    if (handler && handler.hitTest(obj, x, y)) return obj.id;
  }
  return null;
}

// ─── Stroke (freehand path) ─────────────────────────────────────────────────

export function createStroke({ points = [], color = '#222222', width = 2 } = {}) {
  return { id: generateId(), kind: 'stroke', points, color, width };
}

function strokeBbox(stroke) {
  if (stroke.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ddx = px - a.x;
    const ddy = py - a.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

const HIT_PADDING = 4; // pixels of forgiveness around the rendered stroke

function strokeHitTest(stroke, x, y) {
  const tolerance = stroke.width / 2 + HIT_PADDING;
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    const dx = x - p.x, dy = y - p.y;
    return dx * dx + dy * dy <= tolerance * tolerance;
  }
  for (let i = 1; i < stroke.points.length; i++) {
    if (distanceToSegment(x, y, stroke.points[i - 1], stroke.points[i]) <= tolerance) {
      return true;
    }
  }
  return false;
}

registerHandler('stroke', { bbox: strokeBbox, hitTest: strokeHitTest });

// ─── Rect ───────────────────────────────────────────────────────────────────

export function createRect({
  x,
  y,
  w,
  h,
  stroke = '#222222',
  fill = 'transparent',
  strokeWidth = 2,
} = {}) {
  return { id: generateId(), kind: 'rect', x, y, w, h, stroke, fill, strokeWidth };
}

function rectBbox(r) {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function rectHitTest(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

registerHandler('rect', { bbox: rectBbox, hitTest: rectHitTest });

// ─── Circle ─────────────────────────────────────────────────────────────────

export function createCircle({
  cx,
  cy,
  r,
  stroke = '#222222',
  fill = 'transparent',
  strokeWidth = 2,
} = {}) {
  return { id: generateId(), kind: 'circle', cx, cy, r, stroke, fill, strokeWidth };
}

function circleBbox(c) {
  return { x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 };
}

function circleHitTest(c, x, y) {
  const dx = x - c.cx;
  const dy = y - c.cy;
  return dx * dx + dy * dy <= c.r * c.r;
}

registerHandler('circle', { bbox: circleBbox, hitTest: circleHitTest });

// ─── Line / Arrow (shared geometry) ─────────────────────────────────────────

export function createLine({
  x1,
  y1,
  x2,
  y2,
  stroke = '#222222',
  strokeWidth = 2,
} = {}) {
  return { id: generateId(), kind: 'line', x1, y1, x2, y2, stroke, strokeWidth };
}

export function createArrow({
  x1,
  y1,
  x2,
  y2,
  stroke = '#222222',
  strokeWidth = 2,
} = {}) {
  return { id: generateId(), kind: 'arrow', x1, y1, x2, y2, stroke, strokeWidth };
}

function lineLikeBbox(l) {
  return {
    x: Math.min(l.x1, l.x2),
    y: Math.min(l.y1, l.y2),
    w: Math.abs(l.x2 - l.x1),
    h: Math.abs(l.y2 - l.y1),
  };
}

function lineLikeHitTest(l, x, y) {
  const tolerance = (l.strokeWidth ?? 2) / 2 + HIT_PADDING;
  return (
    distanceToSegment(x, y, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }) <= tolerance
  );
}

registerHandler('line', { bbox: lineLikeBbox, hitTest: lineLikeHitTest });
registerHandler('arrow', { bbox: lineLikeBbox, hitTest: lineLikeHitTest });

// ─── Triangle (bbox-inscribed, apex top-center) ─────────────────────────────

export function createTriangle({
  x,
  y,
  w,
  h,
  stroke = '#222222',
  fill = 'transparent',
  strokeWidth = 2,
} = {}) {
  return { id: generateId(), kind: 'triangle', x, y, w, h, stroke, fill, strokeWidth };
}

function triangleBbox(t) {
  return { x: t.x, y: t.y, w: t.w, h: t.h };
}

// Vertices for an isoceles triangle inscribed in the bbox, apex at top-center.
export function triangleVertices(t) {
  return [
    { x: t.x + t.w / 2, y: t.y },           // apex
    { x: t.x, y: t.y + t.h },               // base-left
    { x: t.x + t.w, y: t.y + t.h },         // base-right
  ];
}

function triangleHitTest(t, x, y) {
  const [a, b, c] = triangleVertices(t);
  const sign = (p1, p2, p3) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const p = { x, y };
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

registerHandler('triangle', { bbox: triangleBbox, hitTest: triangleHitTest });

// ─── Text ───────────────────────────────────────────────────────────────────

export function createText({
  x,
  y,
  text,
  color = '#222222',
  fontSize = 24,
} = {}) {
  return { id: generateId(), kind: 'text', x, y, text, color, fontSize };
}

// Approximate width: monospace-ish 0.6 × fontSize per character. The renderer
// can use ctx.measureText for an exact value, but the data model has no
// rendering context, so we ship with a plausible fallback.
function textBbox(t) {
  const len = (t.text ?? '').length;
  return { x: t.x, y: t.y, w: Math.max(1, len * t.fontSize * 0.6), h: t.fontSize };
}

function textHitTest(t, x, y) {
  const b = textBbox(t);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

registerHandler('text', { bbox: textBbox, hitTest: textHitTest });
