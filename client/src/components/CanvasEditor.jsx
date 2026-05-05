import { useEffect, useRef } from 'react';
import { addObject, createStroke } from '../utils/canvas.js';

const DEFAULT_BRUSH = { color: '#222222', width: 2 };

function eventPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function drawScene(canvas, content, draftStroke) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom & similar — no real drawing context

  ctx.fillStyle = content.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const all = draftStroke ? [...content.objects, draftStroke] : content.objects;
  for (const obj of all) {
    if (obj.kind === 'stroke') drawStroke(ctx, obj);
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

export function CanvasEditor({ slide, onUpdate, brush = DEFAULT_BRUSH }) {
  const canvasRef = useRef(null);
  // The in-progress stroke lives in a ref, not state, to avoid a React
  // re-render on every pointermove while drawing. We redraw imperatively.
  const draftRef = useRef(null);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScene(canvas, slide.content, draftRef.current);
  }

  // Re-paint when the persisted content changes (e.g. after a commit, or when
  // the slide prop changes).
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw closes over slide.content
  }, [slide.content]);

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    const { x, y } = eventPoint(canvasRef.current, event);
    draftRef.current = createStroke({
      points: [{ x, y }],
      color: brush.color,
      width: brush.width,
    });
    redraw();
  }

  function handleMouseMove(event) {
    if (!draftRef.current) return;
    const { x, y } = eventPoint(canvasRef.current, event);
    draftRef.current = {
      ...draftRef.current,
      points: [...draftRef.current.points, { x, y }],
    };
    redraw();
  }

  function handleMouseUp() {
    const draft = draftRef.current;
    if (!draft) return;
    draftRef.current = null;
    const finalContent = addObject(slide.content, draft);
    onUpdate(slide.id, { content: finalContent });
    redraw();
  }

  // Listen on window during a draw so leaving the canvas mid-stroke doesn't
  // strand us — the stroke commits even if the cursor crosses the bounds.
  useEffect(() => {
    function onWindowUp() {
      handleMouseUp();
    }
    window.addEventListener('mouseup', onWindowUp);
    return () => window.removeEventListener('mouseup', onWindowUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id, slide.content]);

  return (
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
  );
}
