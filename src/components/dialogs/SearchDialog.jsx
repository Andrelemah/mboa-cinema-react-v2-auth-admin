import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { getGenreLabel, searchFilms } from '../../utils/catalogue.js';
import Icon from '../Icon.jsx';

export default function SearchDialog() {
  const { t, lang, openModal, catalogue } = useApp();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchFilms(catalogue, query), [catalogue, query]);
  const countLabel = results.length === 1
    ? (lang === 'fr' ? 'titre à découvrir' : 'title to discover')
    : t('searchCount');

  return <>
    <h2 className="search-title" id="modal-title">{t('searchTitle')}</h2>
    <div className="search-field-wrap">
      <Icon name="search" />
      <input
        className="search-input" id="search-input" type="search" autoComplete="off"
        placeholder={t('searchPlaceholder')} aria-label={t('search')}
        value={query} onChange={event => setQuery(event.target.value)} data-dialog-autofocus
      />
    </div>
    <p className="search-count" id="search-count" aria-live="polite">{results.length} {countLabel}</p>
    <div className="search-results" id="search-results">
      {results.length ? results.map(film => <button
        type="button" className="search-result" key={film.id}
        onClick={() => openModal('detail', { filmId: film.id })}
      >
        <img src={film.image} alt="" />
        <span><h3>{film.title}</h3><p>{getGenreLabel(film, lang)} · {film.language}</p></span>
      </button>) : <p className="modal-description">{t('noSearch')}</p>}
    </div>
  </>;
}
