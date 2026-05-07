// Canvas-2D rendering for slide objects, shared between the live editor
// and small thumbnails in the slide list. Pure side-effect functions on a
// supplied 2D context — no React, no DOM lookups.

import { triangleVertices } from './canvas.js';

export function drawObject(ctx, obj) {
  const drawer = DRAWERS[obj.kind];
  if (drawer) drawer(ctx, obj);
}

export function renderObjects(ctx, objects) {
  for (const obj of objects) drawObject(ctx, obj);
}

// ─── Per-kind drawers ───────────────────────────────────────────────────────

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
  drawLine(ctx, a);
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const headLen = Math.max(8, (a.strokeWidth ?? 2) * 4);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
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

const DRAWERS = {
  stroke: drawStroke,
  rect: drawRect,
  circle: drawCircle,
  line: drawLine,
  arrow: drawArrow,
  triangle: drawTriangle,
  text: drawText,
};
