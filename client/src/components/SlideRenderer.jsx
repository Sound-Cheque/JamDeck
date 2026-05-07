import { useEffect, useRef } from 'react';
import { renderObjects } from '../utils/canvasRender.js';

// Internal canvas pixel dimensions — matches the editor's source coordinate
// space so persisted shape coords don't need to be rescaled. CSS sizes the
// rendered element responsively.
const CANVAS_W = 800;
const CANVAS_H = 600;

function paint(canvas, content) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = content.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderObjects(ctx, content.objects ?? []);
}

// Read-only slide display, used by the playback view (and a candidate to
// replace the larger editor preview later). No tools, no input handling.
export function SlideRenderer({ slide }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (slide?.type !== 'canvas') return;
    if (!canvasRef.current) return;
    paint(canvasRef.current, slide?.content ?? { objects: [], background: '#ffffff' });
  }, [slide]);

  if (!slide) {
    return <div className="slide-renderer slide-renderer__placeholder" />;
  }

  if (slide.type === 'canvas') {
    return (
      <div className="slide-renderer">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
      </div>
    );
  }

  if (slide.type === 'image') {
    if (!slide.content?.src) {
      return (
        <div className="slide-renderer">
          <div className="slide-renderer__placeholder">No image uploaded yet</div>
        </div>
      );
    }
    return (
      <div className="slide-renderer">
        <img src={slide.content.src} alt="" />
      </div>
    );
  }

  return (
    <div className="slide-renderer">
      <div className="slide-renderer__placeholder">Unsupported slide: {slide.type}</div>
    </div>
  );
}
