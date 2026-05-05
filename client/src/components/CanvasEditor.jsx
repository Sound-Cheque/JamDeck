import { useEffect, useRef, useState } from 'react';
import { addObject, createRect, createStroke } from '../utils/canvas.js';

const DEFAULT_BRUSH = { color: '#222222', width: 2 };
const DEFAULT_TOOL = 'brush';

// ─── Tool handlers ───────────────────────────────────────────────────────────
//
// Each tool defines: how a draft begins (mousedown), how it grows (mousemove),
// and what to commit on mouseup (return null to abort).

const TOOL_HANDLERS = {
  brush: {
    start: (pt, brush) =>
      createStroke({ points: [pt], color: brush.color, width: brush.width }),
    move: (draft, pt) => ({ ...draft, points: [...draft.points, pt] }),
    end: (draft) => draft,
  },
  rect: {
    start: (pt, brush) => ({
      ...createRect({
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
      // eslint-disable-next-line no-unused-vars
      const { _anchor, ...committed } = draft;
      return committed;
    },
  },
};

// ─── Drawing routines (per kind) ─────────────────────────────────────────────

const DRAWERS = {
  stroke: drawStroke,
  rect: drawRect,
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

// ─── Component ──────────────────────────────────────────────────────────────

const TOOL_BUTTONS = [
  { tool: 'brush', label: 'Brush' },
  { tool: 'rect', label: 'Rectangle' },
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
