import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasEditor } from './CanvasEditor.jsx';

function slide(content) {
  return {
    id: 'slide-1',
    type: 'canvas',
    duration: { unit: 'seconds', value: 30 },
    content: content ?? { objects: [], background: '#ffffff' },
  };
}

function renderEditor(props = {}) {
  return render(
    <CanvasEditor
      slide={props.slide ?? slide()}
      onUpdate={props.onUpdate ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 };
  };
});

function mouseEvent(node, type, { x, y }) {
  fireEvent[type](node, { clientX: x, clientY: y, button: 0 });
}

describe('CanvasEditor', () => {
  it('renders a canvas element', () => {
    renderEditor();
    const canvas = screen.getByTestId('canvas-surface');
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('commits a freehand stroke on pointer-up with the traced points', () => {
    const onUpdate = vi.fn();
    renderEditor({ onUpdate });
    const canvas = screen.getByTestId('canvas-surface');

    mouseEvent(canvas, 'mouseDown', { x: 10, y: 20 });
    mouseEvent(canvas, 'mouseMove', { x: 30, y: 40 });
    mouseEvent(canvas, 'mouseMove', { x: 50, y: 60 });
    mouseEvent(canvas, 'mouseUp', { x: 50, y: 60 });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [slideId, patch] = onUpdate.mock.calls[0];
    expect(slideId).toBe('slide-1');
    expect(patch.content.objects).toHaveLength(1);
    const stroke = patch.content.objects[0];
    expect(stroke.kind).toBe('stroke');
    expect(stroke.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
  });

  it('commits a single-point stroke on pointer-up without movement', () => {
    const onUpdate = vi.fn();
    renderEditor({ onUpdate });
    const canvas = screen.getByTestId('canvas-surface');

    mouseEvent(canvas, 'mouseDown', { x: 5, y: 5 });
    mouseEvent(canvas, 'mouseUp', { x: 5, y: 5 });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].content.objects[0].points).toEqual([{ x: 5, y: 5 }]);
  });

  it('preserves existing objects when committing a new stroke', () => {
    const existing = {
      id: 'existing-1',
      kind: 'stroke',
      points: [{ x: 0, y: 0 }],
      color: '#000',
      width: 2,
    };
    const onUpdate = vi.fn();
    renderEditor({
      slide: slide({ objects: [existing], background: '#fff' }),
      onUpdate,
    });
    const canvas = screen.getByTestId('canvas-surface');

    mouseEvent(canvas, 'mouseDown', { x: 100, y: 100 });
    mouseEvent(canvas, 'mouseUp', { x: 100, y: 100 });

    const patch = onUpdate.mock.calls[0][1];
    expect(patch.content.objects).toHaveLength(2);
    expect(patch.content.objects[0]).toEqual(existing); // untouched
    expect(patch.content.objects[1].points).toEqual([{ x: 100, y: 100 }]);
  });

  it('ignores mouseMove when no stroke is in progress', () => {
    const onUpdate = vi.fn();
    renderEditor({ onUpdate });
    const canvas = screen.getByTestId('canvas-surface');

    mouseEvent(canvas, 'mouseMove', { x: 50, y: 50 });
    mouseEvent(canvas, 'mouseUp', { x: 50, y: 50 });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('uses the configured brush color and width on the stroke', () => {
    const onUpdate = vi.fn();
    render(
      <CanvasEditor
        slide={slide()}
        onUpdate={onUpdate}
        brush={{ color: '#ff8800', width: 6 }}
      />,
    );
    const canvas = screen.getByTestId('canvas-surface');

    mouseEvent(canvas, 'mouseDown', { x: 0, y: 0 });
    mouseEvent(canvas, 'mouseUp', { x: 0, y: 0 });

    const stroke = onUpdate.mock.calls[0][1].content.objects[0];
    expect(stroke.color).toBe('#ff8800');
    expect(stroke.width).toBe(6);
  });
});
