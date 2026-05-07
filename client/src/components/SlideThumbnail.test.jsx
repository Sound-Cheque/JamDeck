import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlideThumbnail } from './SlideThumbnail.jsx';

const baseSlide = {
  id: 's1',
  duration: { unit: 'seconds', value: 30 },
};

describe('SlideThumbnail', () => {
  it('renders a canvas element for canvas slides', () => {
    const { container } = render(
      <SlideThumbnail
        slide={{ ...baseSlide, type: 'canvas', content: { objects: [], background: '#fff' } }}
      />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders an <img> for image slides with a src', () => {
    const { container } = render(
      <SlideThumbnail
        slide={{ ...baseSlide, type: 'image', content: { src: '/media/x.png' } }}
      />,
    );
    // alt="" gives the <img> role="presentation", so getByRole('img') misses it
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/media/x.png');
  });

  it('renders a placeholder when image slide has no src', () => {
    const { container } = render(
      <SlideThumbnail slide={{ ...baseSlide, type: 'image', content: { src: null } }} />,
    );
    expect(container.querySelector('.slide-thumb__placeholder')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('renders nothing breakable for unknown slide types', () => {
    const { container } = render(
      <SlideThumbnail slide={{ ...baseSlide, type: 'video', content: {} }} />,
    );
    expect(container.querySelector('.slide-thumb')).toBeInTheDocument();
  });
});
