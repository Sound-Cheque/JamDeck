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
