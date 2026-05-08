import { useNow } from '../hooks/useNow.js';
import { computeProgress } from '../utils/progress.js';
import { slideDurationMs } from '../utils/timing.js';
import { SlideRenderer } from './SlideRenderer.jsx';
import { SlideThumbnail } from './SlideThumbnail.jsx';

const TICK_MS = 50;

export function PlaybackView({ deck, playback }) {
  const now = useNow(TICK_MS);
  const slide = deck?.slides?.[playback?.slideIndex ?? -1] ?? null;
  // Splice the live Link tempo into settings so bars-mode under Link can
  // resolve to ms for the progress ring / countdown.
  const effectiveSettings =
    playback?.linkBpm != null
      ? { ...(deck?.settings ?? {}), linkBpm: playback.linkBpm }
      : deck?.settings;
  const durationMs = slide ? slideDurationMs(slide, effectiveSettings) : null;
  const { fraction, remainingMs } = computeProgress({
    startedAt: playback?.startedAt,
    durationMs: durationMs ?? 0,
    now,
  });

  const settings = deck?.settings ?? {};
  const total = deck?.slides?.length ?? 0;
  const showCountdown =
    durationMs != null &&
    remainingMs > 0 &&
    remainingMs <= (settings.countdownSeconds ?? 5) * 1000;
  const countdownNumber = Math.ceil(remainingMs / 1000);

  return (
    <section className="playback-view">
      <header className="playback-view__header">
        <h2 className="playback-view__title">{deck?.name}</h2>
        <p className="playback-view__position">
          Slide {(playback?.slideIndex ?? 0) + 1} of {total}
        </p>
      </header>

      <div className="playback-view__stage">
        <SlideRenderer slide={slide} />

        {settings.timerStyle === 'shrinkingBall' ? (
          <div
            className="playback-view__ball"
            style={{ width: `${(1 - fraction) * 100}%`, height: `${(1 - fraction) * 100}%` }}
            aria-hidden="true"
          />
        ) : (
          <div
            className="playback-view__fill"
            style={{ width: `${fraction * 100}%` }}
            aria-hidden="true"
          />
        )}

        {showCountdown && (
          <div className="playback-view__countdown" aria-live="polite">
            {countdownNumber}
          </div>
        )}
      </div>

      {settings.showSlideStrip && (
        <ol className="playback-view__strip" aria-label="Slide strip">
          {deck.slides.map((s, i) => (
            <li
              key={s.id}
              className="playback-view__strip-item"
              data-slide-index={i}
              aria-current={i === playback?.slideIndex ? 'true' : undefined}
            >
              <SlideThumbnail slide={s} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
