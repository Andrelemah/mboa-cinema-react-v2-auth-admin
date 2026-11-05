import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getFilmDescription } from '../utils/catalogue.js';
import FilmMeta from './FilmMeta.jsx';
import FilmTitle from './FilmTitle.jsx';
import Icon from './Icon.jsx';

const pad = value => String(value).padStart(2, '0');
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

/**
 * React owns the selected film, rendered panels and 3D style variables.
 * Pointer refs only track short-lived intent and gestures; CSS owns motion.
 */
export default function FilmBinder({ items, instanceKey = 'home' }) {
  const { t, lang, saved, toggleSaved, openModal, binderSelection, setBinderSelection } = useApp();
  const stageRef = useRef(null);
  const coverRefs = useRef(new Map());
  const detailRefs = useRef(new Map());
  const pointerRef = useRef({ last: null, selection: null, timer: 0, index: -1 });
  const gestureRef = useRef(null);
  const suppressClickUntil = useRef(0);
  const pendingFocus = useRef(null);
  const finishGestureRef = useRef(null);
  const [announcement, setAnnouncement] = useState('');

  const rememberedIndex = items.findIndex(film => film.id === binderSelection[instanceKey]);
  const selected = rememberedIndex >= 0 ? rememberedIndex : Math.min(2, items.length - 1);
  const activeFilm = items[selected];
  const activeId = activeFilm?.id;
  const itemSignature = items.map(film => film.id).join('|');
  const home = instanceKey === 'home';
  const titleId = `binder-title-${instanceKey}`;
  const helpId = `binder-help-${instanceKey}`;

  function cancelHover() {
    const pointer = pointerRef.current;
    if (pointer.timer) window.clearTimeout(pointer.timer);
    pointer.timer = 0;
    pointer.index = -1;
  }

  function cardIndex(target) {
    const card = target instanceof Element ? target.closest('[data-binder-card]') : null;
    if (!card || !stageRef.current?.contains(card)) return -1;
    return items.findIndex(film => film.id === card.dataset.id);
  }

  function select(index, { focusCover = false, pointer = pointerRef.current.last } = {}) {
    if (!items.length) return;
    cancelHover();
    const bounded = ((index % items.length) + items.length) % items.length;
    const film = items[bounded];
    const changed = film.id !== activeId;
    if (pointer) pointerRef.current.selection = { ...pointer };

    const focused = document.activeElement;
    const displacedFocus = changed && (
      coverRefs.current.get(activeId)?.contains(focused)
      || detailRefs.current.get(activeId)?.contains(focused)
    );
    if (changed) {
      if (focusCover || displacedFocus) pendingFocus.current = film.id;
      setBinderSelection(instanceKey, film.id);
      setAnnouncement(lang === 'en'
        ? `${bounded + 1} of ${items.length}: ${film.title}`
        : `${bounded + 1} sur ${items.length} : ${film.title}`);
    } else if (focusCover) {
      coverRefs.current.get(film.id)?.focus({ preventScroll: true });
    }
  }

  useEffect(() => {
    if (activeId && binderSelection[instanceKey] !== activeId) {
      setBinderSelection(instanceKey, activeId);
    }
  }, [activeId, binderSelection, instanceKey, setBinderSelection]);

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id !== activeId) return;
    pendingFocus.current = null;
    coverRefs.current.get(id)?.focus({ preventScroll: true });
  }, [activeId]);

  useEffect(() => {
    cancelHover();
    pointerRef.current.last = null;
    pointerRef.current.selection = null;
    gestureRef.current = null;
    return () => cancelHover();
  }, [itemSignature]);

  // A swipe can end outside the original cover. Window listeners finish the
  // gesture while React's stage events handle intent and pointer capture.
  useEffect(() => {
    const onUp = event => finishGestureRef.current?.(event, false);
    const onCancel = event => finishGestureRef.current?.(event, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cancelHover();
      const gesture = gestureRef.current;
      const stage = stageRef.current;
      if (gesture && stage?.hasPointerCapture(gesture.id)) {
        try { stage.releasePointerCapture(gesture.id); } catch { /* Already released. */ }
      }
    };
  }, []);

  finishGestureRef.current = (event, cancelled) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const swipe = !cancelled && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25;
    gestureRef.current = null;
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(event.pointerId)) {
      try { stage.releasePointerCapture(event.pointerId); } catch { /* Capture may end on pointerup. */ }
    }
    if (!swipe) return;
    suppressClickUntil.current = performance.now() + 450;
    event.preventDefault();
    select(selected + (dx < 0 ? 1 : -1), { pointer: null });
  };

  function handlePointerMove(event) {
    const stage = stageRef.current;
    const gesture = gestureRef.current;
    if (gesture?.id === event.pointerId) {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25
          && stage && !stage.hasPointerCapture(event.pointerId)) {
        try { stage.setPointerCapture(event.pointerId); } catch { /* Pointer already ended. */ }
      }
      return;
    }

    if (!window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches
        || !['mouse', 'pen'].includes(event.pointerType) || event.buttons) return;
    const point = { x: event.clientX, y: event.clientY };
    const pointer = pointerRef.current;
    const moved = !pointer.last || distance(point, pointer.last) >= 0.5;
    pointer.last = point;
    if (!moved) return;

    const index = cardIndex(event.target);
    if (index < 0 || index === selected
        || (pointer.selection && distance(point, pointer.selection) < 10)) {
      cancelHover();
      return;
    }
    if (pointer.index === index) return;
    cancelHover();
    pointer.index = index;
    pointer.timer = window.setTimeout(() => {
      const intended = pointer.index;
      pointer.timer = 0;
      pointer.index = -1;
      if (!stageRef.current?.isConnected || intended !== index || !pointer.last) return;
      if (pointer.selection && distance(pointer.last, pointer.selection) < 10) return;
      // Motion alone must not select another cover under a stationary cursor.
      if (cardIndex(document.elementFromPoint(pointer.last.x, pointer.last.y)) !== index) return;
      select(index, { pointer: pointer.last });
    }, 110);
  }

  function handlePointerDown(event) {
    cancelHover();
    if (!['touch', 'pen'].includes(event.pointerType) || !event.isPrimary) return;
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handleStageClick(event) {
    if (performance.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const index = cardIndex(event.target);
    if (index < 0) return;
    event.preventDefault();
    if (index !== selected) select(index);
    else {
      cancelHover();
      openModal('detail', { filmId: activeId });
    }
  }

  function handleKeyDown(event) {
    const fromCover = cardIndex(event.target) >= 0;
    if ((!fromCover && event.target !== stageRef.current)
        || event.altKey || event.ctrlKey || event.metaKey) return;
    const destinations = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: items.length - 1 };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    select(destinations[event.key], { focusCover: fromCover });
  }

  if (!activeFilm) return null;

  return (
    <section
      className={`binder ${home ? 'binder-home' : 'binder-catalogue'}`}
      data-binder=""
      data-binder-key={instanceKey}
      data-selected-film={activeId}
      data-language={lang}
      aria-labelledby={titleId}
    >
      {home ? (
        <div className="binder-heading">
          <div>
            <p className="shelf-kicker">{t('binderEyebrow')}</p>
            <h2 id={titleId}>{t('binderTitle')}</h2>
            <p className="binder-subtitle">{t('binderSubtitle')}</p>
          </div>
          <a className="text-link" href="#films">{t('allFilms')}<Icon name="arrow-up-right" /></a>
        </div>
      ) : <h2 className="sr-only" id={titleId}>{t('binderView')}</h2>}
      <div className="binder-topline">
        <span>{t('binderCollection')} <span className="binder-divider">/</span> {pad(items.length)} {t(items.length === 1 ? 'binderTitleCount' : 'binderTitles')}</span>
        <span className="binder-collection-note">{t('binderPresentation')}</span>
      </div>
      <div className="binder-layout">
        <div
          className="binder-stage"
          data-binder-stage=""
          ref={stageRef}
          tabIndex={0}
          role="group"
          aria-label={t('binderEyebrow')}
          aria-describedby={helpId}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerLeave={() => {
            cancelHover();
            pointerRef.current.last = null;
            pointerRef.current.selection = null;
          }}
          onClick={handleStageClick}
          onKeyDown={handleKeyDown}
        >
          <div className="binder-ambient" aria-hidden="true" />
          <div className="binder-rack">
            {items.map((film, index) => {
              const offset = index - selected;
              const sign = Math.sign(offset);
              const active = offset === 0;
              const hue = /^#[0-9a-f]{6}$/i.test(film.hue) ? film.hue : '#94785e';
              return (
                <button
                  key={film.id}
                  ref={node => {
                    if (node) coverRefs.current.set(film.id, node);
                    else coverRefs.current.delete(film.id);
                  }}
                  type="button"
                  className={`binder-cover ${active ? 'is-active' : ''}`}
                  data-binder-card=""
                  data-id={film.id}
                  data-film={film.id}
                  data-title={film.title}
                  aria-label={`${t('binderSelect')} : ${film.title}`}
                  aria-pressed={active}
                  tabIndex={active ? 0 : -1}
                  style={{
                    '--book-color': hue,
                    '--offset': offset,
                    '--sign': sign,
                    '--rotation': `${active ? -4 : -sign * 56}deg`,
                    '--depth': `${active ? 60 : -Math.abs(offset) * 24}px`,
                    '--lift': active ? '-30px' : '10px',
                    '--scale': active ? 1 : 0.92,
                    zIndex: items.length + 1 - Math.abs(offset),
                  }}
                >
                  <span className="binder-cover-spine" aria-hidden="true"><span>{film.title}</span></span>
                  <span className="binder-cover-face">
                    <img src={film.image} alt="" loading="lazy" decoding="async" draggable={false} />
                    <span className="binder-cover-shade" />
                    <span className="binder-cover-brand">m<span>.</span></span>
                    <span className="binder-cover-title"><FilmTitle film={film} /></span>
                    <span className="binder-cover-number" aria-hidden="true">{pad(index + 1)}</span>
                  </span>
                  <span className="binder-cover-edge" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="binder-shelf" aria-hidden="true" />
          <div className="binder-floor-label" aria-hidden="true">EPIZO <span>COLLECTION</span></div>
        </div>
        <div className="binder-preview">
          <div className="binder-preview-top">
            <span className="binder-preview-label">{t('binderCurrent')}</span>
            <span data-binder-count="" className="binder-count">{pad(selected + 1)} / {pad(items.length)}</span>
          </div>
          <div className="binder-details">
            {items.map(film => {
              const active = film.id === activeId;
              const isSaved = saved.includes(film.id);
              return (
                <article
                  key={film.id}
                  ref={node => {
                    if (node) detailRefs.current.set(film.id, node);
                    else detailRefs.current.delete(film.id);
                  }}
                  className={`binder-detail ${active ? 'is-active' : ''}`}
                  data-binder-detail=""
                  data-id={film.id}
                  hidden={!active}
                >
                  <h3>{film.title}</h3>
                  <FilmMeta film={film} />
                  <p className="binder-description">{getFilmDescription(film, lang)}</p>
                  <div className="binder-detail-actions">
                    <button type="button" className="button hero-primary" onClick={() => openModal('detail', { filmId: film.id })}>
                      <Icon name="play" />{t('binderDetails')}
                    </button>
                    <button type="button" className="button secondary binder-save" aria-pressed={isSaved} onClick={() => toggleSaved(film.id)}>
                      <Icon name={isSaved ? 'check' : 'plus'} /><span>{t(isSaved ? 'added' : 'add')}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="binder-navigation">
            <button type="button" className="binder-back" data-binder-prev="" aria-label={t('binderPrevious')} disabled={items.length < 2} onClick={() => select(selected - 1)}><Icon name="arrow-left" /></button>
            <button type="button" className="binder-next" data-binder-next="" disabled={items.length < 2} onClick={() => select(selected + 1)}>{t('binderNext')}<Icon name="arrow-right" /></button>
          </div>
        </div>
      </div>
      <div className="binder-bottom">
        <p className="binder-help" id={helpId}>
          <span className="binder-help-desktop">{t('binderDesktopHint')}</span>
          <span className="binder-help-touch">{t('binderTouchHint')}</span>
          <span className="sr-only"> {t('binderKeyboardHint')}</span>
        </p>
        <div className="binder-index" role="group" aria-label={t('binderSelect')}>
          {items.map((film, index) => (
            <button type="button" key={film.id} data-binder-dot="" data-id={film.id} className={`binder-index-button ${index === selected ? 'is-active' : ''}`} aria-label={`${t('binderSelect')} : ${film.title}`} aria-pressed={index === selected} onClick={() => select(index)}>
              <span>{pad(index + 1)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" data-binder-live="" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}
