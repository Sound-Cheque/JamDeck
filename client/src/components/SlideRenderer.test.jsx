import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SlideRenderer } from './SlideRenderer.jsx';

describe('SlideRenderer', () => {
  it('renders a canvas for canvas slides', () => {
    const { container } = render(
      <SlideRenderer
        slide={{ id: 's', type: 'canvas', content: { objects: [], background: '#fff' } }}
      />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders an <img> for image slides with a src', () => {
    const { container } = render(
      <SlideRenderer slide={{ id: 's', type: 'image', content: { src: '/media/x.png' } }} />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/media/x.png');
  });

  it('renders a placeholder for an image slide without a src', () => {
    const { container } = render(
      <SlideRenderer slide={{ id: 's', type: 'image', content: { src: null } }} />,
    );
    expect(container.querySelector('.slide-renderer__placeholder')).toBeInTheDocument();
  });

  it('renders a placeholder for unknown slide types', () => {
    const { container } = render(
      <SlideRenderer slide={{ id: 's', type: 'video', content: {} }} />,
    );
    expect(container.querySelector('.slide-renderer__placeholder')).toBeInTheDocument();
  });
});
