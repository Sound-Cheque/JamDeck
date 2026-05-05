import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  describe('toolbar', () => {
    it('renders Brush, Rectangle, Circle, Line, Arrow, Triangle, and Text tool buttons', () => {
      renderEditor();
      expect(screen.getByRole('button', { name: /brush/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rectangle/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /circle/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^line$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /arrow/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /triangle/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /text/i })).toBeInTheDocument();
    });

    it('marks the active tool with aria-pressed=true', () => {
      renderEditor();
      const brush = screen.getByRole('button', { name: /brush/i });
      const rect = screen.getByRole('button', { name: /rectangle/i });
      expect(brush).toHaveAttribute('aria-pressed', 'true');
      expect(rect).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicking a tool button switches the active tool', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /rectangle/i }));
      expect(screen.getByRole('button', { name: /rectangle/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /brush/i })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('circle tool', () => {
    it('drag-to-define commits a circle centered on the anchor', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /circle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 50, y: 50 });
      mouseEvent(canvas, 'mouseMove', { x: 50, y: 80 });
      mouseEvent(canvas, 'mouseUp', { x: 50, y: 80 });

      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('circle');
      expect(obj).toMatchObject({ cx: 50, cy: 50, r: 30 });
      expect(obj._anchor).toBeUndefined();
    });

    it('does not commit a zero-radius circle', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /circle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 30, y: 30 });
      mouseEvent(canvas, 'mouseUp', { x: 30, y: 30 });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('line / arrow tools', () => {
    it('line commits with the dragged endpoints', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /^line$/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 10, y: 20 });
      mouseEvent(canvas, 'mouseMove', { x: 80, y: 90 });
      mouseEvent(canvas, 'mouseUp', { x: 80, y: 90 });

      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('line');
      expect(obj).toMatchObject({ x1: 10, y1: 20, x2: 80, y2: 90 });
    });

    it('arrow uses the same drag behavior with kind=arrow', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /arrow/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 10, y: 10 });
      mouseEvent(canvas, 'mouseMove', { x: 100, y: 10 });
      mouseEvent(canvas, 'mouseUp', { x: 100, y: 10 });

      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('arrow');
      expect(obj).toMatchObject({ x1: 10, y1: 10, x2: 100, y2: 10 });
    });

    it('does not commit a zero-length line', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /^line$/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 30, y: 30 });
      mouseEvent(canvas, 'mouseUp', { x: 30, y: 30 });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('triangle tool', () => {
    it('drag-to-define commits a triangle inscribed in the bbox', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /triangle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 0, y: 0 });
      mouseEvent(canvas, 'mouseMove', { x: 100, y: 80 });
      mouseEvent(canvas, 'mouseUp', { x: 100, y: 80 });

      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('triangle');
      expect(obj).toMatchObject({ x: 0, y: 0, w: 100, h: 80 });
    });
  });

  describe('text tool', () => {
    it('prompts for text on click and commits at the click point', async () => {
      const user = userEvent.setup();
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Hello');
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /text/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 40, y: 50 });
      mouseEvent(canvas, 'mouseUp', { x: 40, y: 50 });

      expect(promptSpy).toHaveBeenCalled();
      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('text');
      expect(obj).toMatchObject({ x: 40, y: 50, text: 'Hello' });

      promptSpy.mockRestore();
    });

    it('aborts when the prompt is cancelled', async () => {
      const user = userEvent.setup();
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /text/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 10, y: 10 });
      mouseEvent(canvas, 'mouseUp', { x: 10, y: 10 });

      expect(onUpdate).not.toHaveBeenCalled();
      promptSpy.mockRestore();
    });
  });

  describe('rect tool', () => {
    it('drag-to-define commits a rect with normalized coordinates', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /rectangle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 10, y: 20 });
      mouseEvent(canvas, 'mouseMove', { x: 50, y: 80 });
      mouseEvent(canvas, 'mouseUp', { x: 50, y: 80 });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj.kind).toBe('rect');
      expect(obj).toMatchObject({ x: 10, y: 20, w: 40, h: 60 });
      expect(obj._anchor).toBeUndefined(); // private hint stripped on commit
    });

    it('normalizes a backwards drag', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /rectangle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 50, y: 80 });
      mouseEvent(canvas, 'mouseMove', { x: 10, y: 20 });
      mouseEvent(canvas, 'mouseUp', { x: 10, y: 20 });

      const obj = onUpdate.mock.calls[0][1].content.objects[0];
      expect(obj).toMatchObject({ x: 10, y: 20, w: 40, h: 60 });
    });

    it('does not commit a zero-size rect', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      renderEditor({ onUpdate });
      await user.click(screen.getByRole('button', { name: /rectangle/i }));
      const canvas = screen.getByTestId('canvas-surface');

      mouseEvent(canvas, 'mouseDown', { x: 10, y: 10 });
      mouseEvent(canvas, 'mouseUp', { x: 10, y: 10 });

      expect(onUpdate).not.toHaveBeenCalled();
    });
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
