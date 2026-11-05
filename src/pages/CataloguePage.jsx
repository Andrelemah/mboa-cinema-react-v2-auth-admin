import { useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { languages } from '../data/catalogue.js';
import { filterCatalogue, getGenreLabel } from '../utils/catalogue.js';
import FilmBinder from '../components/FilmBinder.jsx';
import FilmCard from '../components/FilmCard.jsx';
import Icon from '../components/Icon.jsx';

export default function CataloguePage() {
  const {
    t, lang, route, saved, genre, setGenre, filterLang, setFilterLang,
    resetFilters, libraryView, setLibraryView, catalogue, isDemoCatalogue, catalogueLoading, catalogueError, refreshCatalogue,
  } = useApp();
  const allGenresRef = useRef(null);
  const isList = route === 'ma-liste';
  const isStory = route === 'histoires';
  const isLibrary = route === 'films';
  const baseItems = catalogue.filter(film => isList
    ? saved.includes(film.id)
    : isStory ? film.type === 'story' : isDemoCatalogue || film.type === 'film');
  const genres = [...new Set(baseItems.map(film => film.genre))];
  const items = filterCatalogue(baseItems, { genre, language: filterLang });
  const emptyList = isList && baseItems.length === 0;

  const clearFilters = () => {
    resetFilters();
    window.requestAnimationFrame(() => allGenresRef.current?.focus({ preventScroll: true }));
  };

  return (
    <section className={`page ${isLibrary ? 'library-page' : ''}`}>
      <div className="page-heading">
        <div>
          {isDemoCatalogue && <span className="pill-notice"><Icon name="info" />{t('catalogueNote')}</span>}
          <h1>{t(isList ? 'list' : isStory ? 'stories' : 'films')}</h1>
          <p>{t(isList ? 'listDesc' : isStory ? 'storiesDesc' : 'filmsDesc')}</p>
        </div>
        <a href="#abonnements" className="text-link">{t('seeOffers')}<Icon name="arrow-up-right" /></a>
      </div>
      {isLibrary && (
        <div className="library-view-switch" role="group" aria-label={t('binderMode')}>
          <button className={libraryView === 'binder' ? 'active' : ''} aria-pressed={libraryView === 'binder'} onClick={() => setLibraryView('binder')}>
            <Icon name="library" />{t('binderView')}
          </button>
          <button className={libraryView === 'grid' ? 'active' : ''} aria-pressed={libraryView === 'grid'} onClick={() => setLibraryView('grid')}>
            <Icon name="grid" />{t('gridView')}
          </button>
        </div>
      )}
      {(!isList || saved.length > 0) && (
        <div className="filters" role="group" aria-label={lang === 'fr' ? 'Filtres du catalogue' : 'Catalogue filters'}>
          <button ref={allGenresRef} className={`filter-button ${genre === 'all' ? 'active' : ''}`} aria-pressed={genre === 'all'} onClick={() => setGenre('all')}>
            {t('allGenres')}
          </button>
          <button className={`filter-button ${genre === 'mobile' ? 'active' : ''}`} aria-pressed={genre === 'mobile'} onClick={() => setGenre('mobile')}>
            {t('mobileSelection')}
          </button>
          {genres.slice(0, 3).map(item => (
            <button key={item} className={`filter-button ${genre === item ? 'active' : ''}`} aria-pressed={genre === item} onClick={() => setGenre(item)}>
              {getGenreLabel({ genre: item }, lang)}
            </button>
          ))}
          <select className="filter-select" id="catalogue-language" aria-label={t('allLanguages')} value={filterLang} onChange={event => setFilterLang(event.target.value)}>
            {languages.map(language => (
              <option key={language.code} value={language.code}>
                {language.code === 'all' ? t('allLanguages') : language.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {(catalogueLoading || catalogueError) && <div className="catalogue-status" role="status"><p>{catalogueLoading ? (lang === 'fr' ? 'Chargement du catalogue…' : 'Loading the catalogue…') : catalogueError}</p>{catalogueError && <button className="button ghost" onClick={refreshCatalogue}>{lang === 'fr' ? 'Réessayer' : 'Try again'}</button>}</div>}
      {items.length > 0 ? (
        isLibrary && libraryView === 'binder'
          ? <FilmBinder items={items} instanceKey="catalogue" />
          : <div className="card-grid catalogue-grid">{items.map(film => <FilmCard key={film.id} film={film} />)}</div>
      ) : !catalogueLoading && !catalogueError ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name={isList ? 'bookmark' : 'search'} /></span>
          <h2>{t(emptyList ? 'emptyList' : 'noResults')}</h2>
          <p>{t(emptyList ? 'emptyListCopy' : 'noResultsCopy')}</p>
          {emptyList
            ? <a href="#films" className="button">{t('explore')}<Icon name="arrow-right" /></a>
            : <button className="button" onClick={clearFilters}>{t('reset')}</button>}
        </div>
      ) : null}
    </section>
  );
}
