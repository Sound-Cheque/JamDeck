import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlideEditor } from './SlideEditor.jsx';

beforeEach(() => {
  HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 };
  };
});

describe('SlideEditor', () => {
  it('shows a hint when no slide is selected', () => {
    render(<SlideEditor slide={null} onUpdate={vi.fn()} />);
    expect(screen.getByText(/select a slide/i)).toBeInTheDocument();
  });

  it('renders a canvas surface for canvas slides', () => {
    const slide = {
      id: 's1',
      type: 'canvas',
      duration: { unit: 'seconds', value: 30 },
      content: { objects: [], background: '#ffffff' },
    };
    render(<SlideEditor slide={slide} onUpdate={vi.fn()} />);
    expect(screen.getByTestId('canvas-surface')).toBeInTheDocument();
  });

  it('renders a placeholder for non-canvas slide types', () => {
    const slide = {
      id: 's1',
      type: 'image',
      duration: { unit: 'seconds', value: 30 },
      content: { src: 'media/foo.jpg' },
    };
    render(<SlideEditor slide={slide} onUpdate={vi.fn()} />);
    expect(screen.getByText(/image/i)).toBeInTheDocument();
  });
});
