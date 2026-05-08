import { CanvasEditor } from './CanvasEditor.jsx';
import { ImageSlideEditor } from './ImageSlideEditor.jsx';
import { VideoSlideEditor } from './VideoSlideEditor.jsx';

export function SlideEditor({ slide, onUpdate }) {
  if (!slide) {
    return <p className="slide-editor__hint">Select a slide to edit it.</p>;
  }

  if (slide.type === 'canvas') {
    return <CanvasEditor slide={slide} onUpdate={onUpdate} />;
  }

  if (slide.type === 'image') {
    return <ImageSlideEditor slide={slide} onUpdate={onUpdate} />;
  }

  if (slide.type === 'video') {
    return <VideoSlideEditor slide={slide} onUpdate={onUpdate} />;
  }

  return <p className="slide-editor__hint">Unknown slide type: {slide.type}</p>;
}
