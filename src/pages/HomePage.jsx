import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { languages } from '../data/catalogue.js';
import { selectHeroFilms } from '../utils/publishedContent.js';
import FilmBinder from '../components/FilmBinder.jsx';
import FilmMeta from '../components/FilmMeta.jsx';
import FilmRail from '../components/FilmRail.jsx';
import FilmTitle from '../components/FilmTitle.jsx';
import Icon from '../components/Icon.jsx';
import TitleLines from './TitleLines.jsx';

const heroIds = ['fleuve', 'taxi', 'foumban'];
const heroTaglines = {
  fleuve: 'Some journeys begin with coming home.',
  taxi: 'One last fare. A night that changes everything.',
  foumban: 'Sometimes, a new beginning is closer than you think.',
};
function Hero({ onExplore }) {
  const { t, lang, saved, toggleSaved, openModal, catalogue, findFilm, isDemoCatalogue } = useApp();
  const [slide, setSlide] = useState(0);
  const [shift, setShift] = useState(0);
  const heroRef = useRef(null);
  const featured = isDemoCatalogue ? heroIds.map(findFilm).filter(Boolean) : selectHeroFilms(catalogue);
  const activeSlide = Math.min(slide, Math.max(0, featured.length - 1));
  const film = featured[activeSlide];

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const narrowScreen = window.matchMedia('(max-width: 760px)');
    let frame = 0;

    const update = () => {
      frame = 0;
      const element = heroRef.current;
      if (!element) return;
      const nextShift = reducedMotion.matches || narrowScreen.matches
        ? 0
        : Math.min(40, Math.max(0, -element.getBoundingClientRect().top * 0.12));
      setShift(Math.round(nextShift * 100) / 100);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    reducedMotion.addEventListener('change', schedule);
    narrowScreen.addEventListener('change', schedule);
    update();

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reducedMotion.removeEventListener('change', schedule);
      narrowScreen.removeEventListener('change', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!film) return null;
  const isSaved = saved.includes(film.id);

  return (
    <section
      className="hero"
      data-hero-film={film.id}
      aria-label={t('featured')}
      ref={heroRef}
      style={{ '--hero-shift': `${shift}px` }}
    >
      <img className="hero-bg" src={film.image} alt="" fetchPriority="high" />
      <div className="hero-content">
        <div className="hero-original">
          <span className="hero-original-brand">epizo<span>.</span></span>
          <span>{t('originalShort')}</span>
        </div>
        <h1><FilmTitle film={film} /></h1>
        <FilmMeta film={film} />
        <p className="hero-description">
          {lang === 'en' ? heroTaglines[film.id] || film.tagline : film.tagline}
        </p>
        <div className="action-row">
          <button className="button hero-primary" onClick={() => openModal('detail', { filmId: film.id })}>
            <Icon name="play" />{t('discoverFilm')}
          </button>
          <button className="button secondary" aria-pressed={isSaved} onClick={() => toggleSaved(film.id)}>
            <Icon name={isSaved ? 'check' : 'plus'} />
            <span>{t(isSaved ? 'added' : 'add')}</span>
          </button>
        </div>
        <button className="hero-collection hero-library-link" onClick={onExplore}>
          {t('binderExplore')}<Icon name="arrow-down" />
        </button>
      </div>
      <div className="hero-switcher">
        <span className="hero-switcher-count" aria-hidden="true">{String(activeSlide + 1).padStart(2, '0')}<span> / {String(featured.length).padStart(2, '0')}</span></span>
        <div className="hero-thumbnails" role="group" aria-label={t('featured')}>
          {featured.map((item, index) => {
            return (
              <button
                key={item.id}
                className={`hero-thumbnail ${activeSlide === index ? 'active' : ''}`}
                aria-label={item.title}
                aria-pressed={activeSlide === index}
                title={item.title}
                onClick={() => setSlide(index)}
              >
                <img src={item.image} alt="" draggable={false} />
              </button>
            );
          })}
        </div>
        <button className="circle-arrow" aria-label={t('next')} disabled={featured.length < 2} onClick={() => setSlide(current => (current + 1) % featured.length)}>
          <Icon name="arrow-right" />
        </button>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t, lang, openModal, setGenre, setFilterLang, navigate, catalogue, findFilm, isDemoCatalogue, catalogueLoading, catalogueError, refreshCatalogue } = useApp();
  const contentRef = useRef(null);
  const shortStories = catalogue.filter(film => film.type === 'story');
  const editorial = isDemoCatalogue ? findFilm('racines') : shortStories.find(film => film.featured) || shortStories[0];

  const exploreLibrary = () => {
    const stage = contentRef.current?.querySelector('[data-binder-stage]');
    if (!stage) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
    stage.focus({ preventScroll: true });
  };

  const exploreLanguage = code => {
    setGenre('all');
    setFilterLang(code);
    navigate('films');
  };

  return (
    <>
      {!catalogue.length && <section className="page service-state" aria-live="polite">
        <span className="eyebrow">EPIZO CINÉMA</span>
        <h1>{catalogueLoading ? (lang === 'fr' ? 'Votre cinéma se prépare.' : 'Your cinema is loading.') : catalogueError ? (lang === 'fr' ? 'Le catalogue est momentanément indisponible.' : 'The catalogue is temporarily unavailable.') : (lang === 'fr' ? 'Le prochain chapitre arrive.' : 'The next chapter is coming.')}</h1>
        <p>{catalogueLoading ? (lang === 'fr' ? 'Chargement des films et des histoires…' : 'Loading films and stories…') : catalogueError || (lang === 'fr' ? 'Les premiers films apparaîtront ici dès leur publication.' : 'The first films will appear here as soon as they are published.')}</p>
        {catalogueError && <button className="button" onClick={refreshCatalogue}>{lang === 'fr' ? 'Réessayer' : 'Try again'}</button>}
      </section>}
      <Hero onExplore={exploreLibrary} />
      <div className="home-content" ref={contentRef}>
        {catalogue.length > 0 && catalogueError && <p className="catalogue-status" role="status">{catalogueError}</p>}
        <FilmBinder items={catalogue} instanceKey="home" />
        {editorial && <section className="story-spotlight" aria-labelledby="spotlight-title">
          <div className="spotlight-art">
            <img src={editorial.image} alt="" loading="lazy" decoding="async" />
            <span className="spotlight-credit">{isDemoCatalogue ? 'NOS VOIX, NOS RACINES' : editorial.title}</span>
          </div>
          <div className="spotlight-content">
            <p className="shelf-kicker">{t('editorialKicker')}</p>
            <h2 id="spotlight-title"><TitleLines>{isDemoCatalogue ? t('editorialTitle') : editorial.title}</TitleLines></h2>
            <p className="spotlight-copy">{isDemoCatalogue ? t('editorialCopy') : lang === 'en' ? editorial.descriptionEn : editorial.description}</p>
            <button className="text-link spotlight-link" onClick={() => openModal('detail', { filmId: editorial.id })}>
              {t('editorialAction')}<span><Icon name="arrow-up-right" /></span>
            </button>
          </div>
        </section>}
        <FilmRail
          id="histoires"
          title={t('shortHeading')}
          kicker={t('shortKicker')}
          items={shortStories}
          landscape
          href="#histoires"
        />
        <section className="language-explorer" aria-labelledby="language-explorer-title">
          <div className="language-explorer-heading">
            <div>
              <p className="shelf-kicker">{t('languagesSmall')}</p>
              <h2 id="language-explorer-title">{t('languageExplore')}</h2>
            </div>
            <button className="text-link" onClick={() => openModal('languages')}>
              {t('languageTitle')}<Icon name="arrow-up-right" />
            </button>
          </div>
          <div className="language-chips">
            {languages.filter(language => language.code !== 'all').map(language => (
              <button className="language-chip" key={language.code} onClick={() => exploreLanguage(language.code)}>
                {language.code === 'und-bamileke'
                  ? (lang === 'fr' ? 'Langue bamiléké' : 'Bamiléké language')
                  : language.label}
                {language.code === 'und-bamileke' && <small>{lang === 'fr' ? 'À préciser' : 'To be confirmed'}</small>}
                <Icon name="arrow-up-right" />
              </button>
            ))}
          </div>
          <p className="language-note">{t('languageNote')}</p>
        </section>
        <section className="offer-banner">
          <div>
            <h2>{t('offerHeading')}</h2>
            <p>{t('offerCopy')}</p>
          </div>
          <a href="#abonnements" className="button ghost">{t('seeOffers')}<Icon name="arrow-right" /></a>
        </section>
      </div>
    </>
  );
}
