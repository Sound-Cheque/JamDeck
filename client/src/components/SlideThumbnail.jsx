import { useEffect, useRef } from 'react';
import { renderObjects } from '../utils/canvasRender.js';

// Thumbnail canvas internal pixel dimensions. CSS sizes the visible box
// independently — these are the drawing-surface pixels (kept proportional to
// the editor's 800×600 source so shapes don't distort).
const W = 112;
const H = 84;
// Source canvas (editor) dimensions used for coordinate scaling.
const SRC_W = 800;
const SRC_H = 600;

function paint(canvas, content) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = content.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Uniform scale so shapes preserve their aspect ratio inside the thumb.
  const scale = Math.min(canvas.width / SRC_W, canvas.height / SRC_H);
  const ox = (canvas.width - SRC_W * scale) / 2;
  const oy = (canvas.height - SRC_H * scale) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  renderObjects(ctx, content.objects ?? []);
  ctx.restore();
}

export function SlideThumbnail({ slide }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (slide.type !== 'canvas') return;
    if (!canvasRef.current) return;
    paint(canvasRef.current, slide.content ?? { objects: [], background: '#ffffff' });
  }, [slide]);

  if (slide.type === 'canvas') {
    return (
      <span className="slide-thumb" aria-hidden="true">
        <canvas ref={canvasRef} width={W} height={H} />
      </span>
    );
  }

  if (slide.type === 'image') {
    if (!slide.content?.src) {
      return (
        <span className="slide-thumb" aria-hidden="true">
          <span className="slide-thumb__placeholder">🖼</span>
        </span>
      );
    }
    return (
      <span className="slide-thumb" aria-hidden="true">
        <img src={slide.content.src} alt="" />
      </span>
    );
  }

  return (
    <span className="slide-thumb" aria-hidden="true">
      <span className="slide-thumb__placeholder">?</span>
    </span>
  );
}
