import { useEffect, useRef, useState } from 'react';
import {
  addObject,
  createArrow,
  createCircle,
  createLine,
  createRect,
  createStroke,
  createText,
  createTriangle,
  triangleVertices,
} from '../utils/canvas.js';

const DEFAULT_BRUSH = { color: '#222222', width: 2 };
const DEFAULT_TOOL = 'brush';

// ─── Tool handlers ───────────────────────────────────────────────────────────
//
// Each tool defines: how a draft begins (mousedown), how it grows (mousemove),
// and what to commit on mouseup (return null to abort).

// Strip private fields (anything starting with _) from a draft on commit.
function strip(draft) {
  const out = {};
  for (const k of Object.keys(draft)) if (!k.startsWith('_')) out[k] = draft[k];
  return out;
}

// Bounding-box drag tool factory: shared by rect and triangle.
function bboxDragTool(create) {
  return {
    start: (pt, brush) => ({
      ...create({
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        stroke: brush.color,
        strokeWidth: brush.width,
        fill: 'transparent',
      }),
      _anchor: { x: pt.x, y: pt.y },
    }),
    move: (draft, pt) => {
      const { x: ax, y: ay } = draft._anchor;
      return {
        ...draft,
        x: Math.min(ax, pt.x),
        y: Math.min(ay, pt.y),
        w: Math.abs(pt.x - ax),
        h: Math.abs(pt.y - ay),
      };
    },
    end: (draft) => {
      if (draft.w <= 0 || draft.h <= 0) return null;
      return strip(draft);
    },
  };
}

// Two-endpoint drag tool factory: shared by line and arrow.
function endpointDragTool(create) {
  return {
    start: (pt, brush) =>
      create({
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        stroke: brush.color,
        strokeWidth: brush.width,
      }),
    move: (draft, pt) => ({ ...draft, x2: pt.x, y2: pt.y }),
    end: (draft) => {
      if (draft.x1 === draft.x2 && draft.y1 === draft.y2) return null;
      return strip(draft);
    },
  };
}

const TOOL_HANDLERS = {
  brush: {
    start: (pt, brush) =>
      createStroke({ points: [pt], color: brush.color, width: brush.width }),
    move: (draft, pt) => ({ ...draft, points: [...draft.points, pt] }),
    end: (draft) => draft,
  },
  rect: bboxDragTool(createRect),
  triangle: bboxDragTool(createTriangle),
  line: endpointDragTool(createLine),
  arrow: endpointDragTool(createArrow),
  circle: {
    start: (pt, brush) => ({
      ...createCircle({
        cx: pt.x,
        cy: pt.y,
        r: 0,
        stroke: brush.color,
        strokeWidth: brush.width,
        fill: 'transparent',
      }),
      _anchor: { x: pt.x, y: pt.y },
    }),
    move: (draft, pt) => {
      const dx = pt.x - draft._anchor.x;
      const dy = pt.y - draft._anchor.y;
      return { ...draft, r: Math.sqrt(dx * dx + dy * dy) };
    },
    end: (draft) => {
      if (draft.r <= 0) return null;
      return strip(draft);
    },
  },
  text: {
    // Click + prompt for text. No drag; mousemove/up are no-ops.
    start: (pt, brush) => {
      const value = window.prompt('Enter text:');
      if (value == null || value === '') return null;
      return createText({ x: pt.x, y: pt.y, text: value, color: brush.color, fontSize: 24 });
    },
    move: (draft) => draft,
    end: (draft) => draft,
  },
};

// ─── Drawing routines (per kind) ─────────────────────────────────────────────

const DRAWERS = {
  stroke: drawStroke,
  rect: drawRect,
  circle: drawCircle,
  line: drawLine,
  arrow: drawArrow,
  triangle: drawTriangle,
  text: drawText,
};

function eventPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function drawScene(canvas, content, draftObject) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom & similar — no real drawing context

  ctx.fillStyle = content.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const all = draftObject ? [...content.objects, draftObject] : content.objects;
  for (const obj of all) {
    const drawer = DRAWERS[obj.kind];
    if (drawer) drawer(ctx, obj);
  }
}

function drawStroke(ctx, stroke) {
  if (stroke.points.length === 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

function drawRect(ctx, rect) {
  if (rect.w <= 0 || rect.h <= 0) return;
  if (rect.fill && rect.fill !== 'transparent') {
    ctx.fillStyle = rect.fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  if (rect.stroke && rect.strokeWidth > 0) {
    ctx.strokeStyle = rect.stroke;
    ctx.lineWidth = rect.strokeWidth;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}

function drawCircle(ctx, c) {
  if (c.r <= 0) return;
  ctx.beginPath();
  ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
  if (c.fill && c.fill !== 'transparent') {
    ctx.fillStyle = c.fill;
    ctx.fill();
  }
  if (c.stroke && c.strokeWidth > 0) {
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = c.strokeWidth;
    ctx.stroke();
  }
}

function drawLine(ctx, l) {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(l.x1, l.y1);
  ctx.lineTo(l.x2, l.y2);
  ctx.strokeStyle = l.stroke;
  ctx.lineWidth = l.strokeWidth ?? 2;
  ctx.stroke();
}

function drawArrow(ctx, a) {
  // Shaft
  drawLine(ctx, a);
  // Arrowhead at (x2, y2), pointing along the segment
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const headLen = Math.max(8, (a.strokeWidth ?? 2) * 4);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // perpendicular
  const py = ux;
  const baseX = a.x2 - ux * headLen;
  const baseY = a.y2 - uy * headLen;
  const half = headLen * 0.5;
  ctx.beginPath();
  ctx.moveTo(a.x2, a.y2);
  ctx.lineTo(baseX + px * half, baseY + py * half);
  ctx.lineTo(baseX - px * half, baseY - py * half);
  ctx.closePath();
  ctx.fillStyle = a.stroke;
  ctx.fill();
}

function drawTriangle(ctx, t) {
  if (t.w <= 0 || t.h <= 0) return;
  const [a, b, c] = triangleVertices(t);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  if (t.fill && t.fill !== 'transparent') {
    ctx.fillStyle = t.fill;
    ctx.fill();
  }
  if (t.stroke && t.strokeWidth > 0) {
    ctx.strokeStyle = t.stroke;
    ctx.lineWidth = t.strokeWidth;
    ctx.stroke();
  }
}

function drawText(ctx, t) {
  if (!t.text) return;
  ctx.fillStyle = t.color;
  ctx.font = `${t.fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(t.text, t.x, t.y);
}

// ─── Component ──────────────────────────────────────────────────────────────

const TOOL_BUTTONS = [
  { tool: 'brush', label: 'Brush' },
  { tool: 'rect', label: 'Rectangle' },
  { tool: 'circle', label: 'Circle' },
  { tool: 'line', label: 'Line' },
  { tool: 'arrow', label: 'Arrow' },
  { tool: 'triangle', label: 'Triangle' },
  { tool: 'text', label: 'Text' },
];

export function CanvasEditor({
  slide,
  onUpdate,
  brush: initialBrush = DEFAULT_BRUSH,
  tool: initialTool = DEFAULT_TOOL,
}) {
  const canvasRef = useRef(null);
  // The in-progress draft and the tool used to start it. Refs (not state) so
  // mousemove doesn't trigger a React re-render — we redraw imperatively.
  const draftRef = useRef(null);
  const activeToolRef = useRef(null);

  const [tool, setTool] = useState(initialTool);
  const [brush, setBrush] = useState(initialBrush);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScene(canvas, slide.content, draftRef.current);
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.content]);

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    const handler = TOOL_HANDLERS[tool];
    if (!handler) return;
    const pt = eventPoint(canvasRef.current, event);
    activeToolRef.current = tool;
    draftRef.current = handler.start(pt, brush);
    redraw();
  }

  function handleMouseMove(event) {
    if (!draftRef.current) return;
    const handler = TOOL_HANDLERS[activeToolRef.current];
    if (!handler) return;
    const pt = eventPoint(canvasRef.current, event);
    draftRef.current = handler.move(draftRef.current, pt);
    redraw();
  }

  function handleMouseUp() {
    const draft = draftRef.current;
    if (!draft) return;
    const handler = TOOL_HANDLERS[activeToolRef.current];
    draftRef.current = null;
    activeToolRef.current = null;
    const committed = handler ? handler.end(draft) : draft;
    if (committed) {
      const finalContent = addObject(slide.content, committed);
      onUpdate(slide.id, { content: finalContent });
    }
    redraw();
  }

  // Window-level mouseup so a stroke that ends off-canvas still commits.
  useEffect(() => {
    function onWindowUp() {
      handleMouseUp();
    }
    window.addEventListener('mouseup', onWindowUp);
    return () => window.removeEventListener('mouseup', onWindowUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id, slide.content]);

  return (
    <div className="canvas-editor">
      <div className="canvas-editor__toolbar" role="toolbar" aria-label="Drawing tools">
        {TOOL_BUTTONS.map(({ tool: t, label }) => (
          <button
            key={t}
            type="button"
            aria-pressed={tool === t ? 'true' : 'false'}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
        <label className="canvas-editor__color">
          Color
          <input
            type="color"
            value={brush.color}
            onChange={(e) => setBrush((b) => ({ ...b, color: e.target.value }))}
          />
        </label>
        <label className="canvas-editor__width">
          Width
          <input
            type="number"
            min={1}
            max={50}
            value={brush.width}
            onChange={(e) => setBrush((b) => ({ ...b, width: Number(e.target.value) }))}
          />
        </label>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="canvas-surface"
        className="canvas-surface"
        width={800}
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
