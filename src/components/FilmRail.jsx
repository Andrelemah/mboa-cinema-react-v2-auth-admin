import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import FilmCard from './FilmCard.jsx';
import Icon from './Icon.jsx';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const pad = value => String(value).padStart(2, '0');

/** Native horizontal scrolling, enhanced with accessible page controls. */
export default function FilmRail({ id, title, kicker, items, landscape = false, href = '#films' }) {
  const { t } = useApp();
  const films = items.filter(Boolean);
  const filmIds = films.map(film => film.id).join('|');
  const railRef = useRef(null);
  const frameRef = useRef(0);
  const [metrics, setMetrics] = useState({ overflow: false, atStart: true, atEnd: true, progress: 0, fill: 1, size: 1, first: 0, last: 0 });

  const measurements = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return null;
    const cards = [...rail.children];
    if (!cards.length) return null;
    const bounds = rail.getBoundingClientRect();
    const position = Math.max(0, rail.scrollLeft);
    const cardBounds = cards.map(card => card.getBoundingClientRect());
    const firstStart = cardBounds[0].left - bounds.left + position;
    const starts = cardBounds.map(card => card.left - bounds.left + position - firstStart);
    return {
      rail, cards, bounds, cardBounds, position, starts,
      step: Math.max(1, starts.length > 1 ? starts[1] - starts[0] : cardBounds[0].width),
      maximum: Math.max(0, rail.scrollWidth - rail.clientWidth),
    };
  }, []);

  const update = useCallback(() => {
    frameRef.current = 0;
    const current = measurements();
    if (!current) return;
    const { rail, bounds, cardBounds, position, maximum } = current;
    const overflow = maximum > 2;
    const total = Math.max(1, rail.scrollWidth);
    const visible = cardBounds.map((card, index) => ({ card, index })).filter(({ card }) => card.right > bounds.left + 2 && card.left < bounds.right - 2);
    setMetrics({
      overflow,
      atStart: !overflow || position <= 2,
      atEnd: !overflow || position >= maximum - 2,
      progress: overflow ? clamp(position / maximum, 0, 1) : 0,
      fill: clamp((position + rail.clientWidth) / total, 0, 1),
      size: clamp(rail.clientWidth / total, 0, 1),
      first: visible[0]?.index ?? 0,
      last: visible.at(-1)?.index ?? 0,
    });
  }, [measurements]);

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = window.requestAnimationFrame(update);
  }, [update]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    rail.addEventListener('scroll', schedule, { passive: true });
    let observer;
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(schedule);
      observer.observe(rail);
      [...rail.children].forEach(card => observer.observe(card));
    } else {
      window.addEventListener('resize', schedule, { passive: true });
    }
    update();
    return () => {
      rail.removeEventListener('scroll', schedule);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [filmIds, schedule, update]);

  const moveTo = left => {
    const rail = railRef.current;
    if (!rail) return;
    const destination = clamp(left, 0, Math.max(0, rail.scrollWidth - rail.clientWidth));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left: destination, behavior: reduced ? 'instant' : 'smooth' });
    schedule();
  };

  const movePage = direction => {
    const current = measurements();
    if (!current) return;
    const { rail, cards, starts, position, step, maximum } = current;
    const cardsPerPage = Math.max(1, Math.floor(rail.clientWidth / step));
    const nearest = starts.reduce((best, start, index) => Math.abs(start - position) < Math.abs(starts[best] - position) ? index : best, 0);
    const targetIndex = clamp(nearest + direction * cardsPerPage, 0, cards.length - 1);
    moveTo(direction < 0 && targetIndex === 0 ? 0 : Math.min(maximum, starts[targetIndex]));
  };

  const onKeyDown = event => {
    if (event.target !== railRef.current || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      movePage(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(event.key === 'Home' ? 0 : railRef.current.scrollWidth);
    }
  };

  if (!films.length) return null;

  return (
    <section
      className={`shelf ${landscape ? 'shelf-wide' : 'shelf-posters'} ${metrics.overflow ? 'has-overflow' : ''} ${metrics.atStart ? 'at-start' : ''} ${metrics.atEnd ? 'at-end' : ''}`}
      data-carousel
      aria-labelledby={`heading-${id}`}
      style={{ '--rail-progress': metrics.progress, '--rail-fill': metrics.fill, '--rail-size': metrics.size }}
    >
      <div className="shelf-heading">
        <div><p className="shelf-kicker">{kicker}</p><h2 id={`heading-${id}`}>{title}</h2></div>
        <div className="shelf-heading-actions">
          <a className="text-link shelf-all" href={href}>{t('seeAll')}<Icon name="chevron-right" /></a>
          {metrics.overflow && <div className="shelf-controls">
            <span className="rail-counter" data-rail-counter aria-hidden="true">{pad(metrics.first + 1)} — {pad(metrics.last + 1)} / {pad(films.length)}</span>
            <button className="rail-arrow" data-rail-prev aria-controls={`rail-${id}`} aria-label={`${t('previousTitles')} — ${title}`} disabled={metrics.atStart} onClick={() => movePage(-1)}>
              <Icon name="arrow-left" />
            </button>
            <button className="rail-arrow" data-rail-next aria-controls={`rail-${id}`} aria-label={`${t('nextTitles')} — ${title}`} disabled={metrics.atEnd} onClick={() => movePage(1)}>
              <Icon name="arrow-right" />
            </button>
          </div>}
        </div>
      </div>
      <p className="sr-only" id={`hint-${id}`}>{t('railHint')}</p>
      <div className="shelf-viewport" id={`rail-${id}`} data-rail role="group" aria-labelledby={`heading-${id}`} aria-describedby={`hint-${id}`} tabIndex={0} ref={railRef} onKeyDown={onKeyDown} onLoadCapture={schedule}>
        {films.map(film => <FilmCard key={film.id} film={film} landscape={landscape} />)}
      </div>
      <div className="rail-progress" aria-hidden="true"><span /></div>
    </section>
  );
}
