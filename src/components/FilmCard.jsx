import { useApp } from '../context/AppContext.jsx';
import { getGenreLabel } from '../utils/catalogue.js';
import FilmTitle from './FilmTitle.jsx';
import Icon from './Icon.jsx';

export default function FilmCard({ film, landscape = false }) {
  const { t, lang, saved, toggleSaved, openModal } = useApp();
  const isSaved = saved.includes(film.id);
  const saveLabel = lang === 'fr'
    ? `${isSaved ? 'Retirer de Ma liste' : 'Ajouter à Ma liste'} : ${film.title}`
    : `${isSaved ? 'Remove from My list' : 'Add to My list'}: ${film.title}`;

  function handleSave(event) {
    const button = event.currentTarget;
    const main = button.closest('main');
    const cards = main ? [...main.querySelectorAll('.film-card')] : [];
    const position = cards.indexOf(button.closest('.film-card'));
    toggleSaved(film.id);
    // Removing a saved title can unmount this card. Keep keyboard focus in
    // the same collection, or on its empty-state action when it becomes empty.
    requestAnimationFrame(() => {
      if (button.isConnected || !main?.isConnected) return;
      const remaining = [...main.querySelectorAll('.card-open')];
      const target = remaining[Math.max(0, Math.min(position, remaining.length - 1))]
        || main.querySelector('.empty-state a, .empty-state button')
        || main;
      target.focus({ preventScroll: true });
    });
  }

  return (
    <article className={`film-card ${landscape ? 'landscape' : 'poster'}`} data-film={film.id}>
      <div className="card-art">
        <button
          type="button"
          className="card-open"
          data-id={film.id}
          aria-label={`${t('discoverFilm')}: ${film.title}`}
          onClick={() => openModal('detail', { filmId: film.id })}
        >
          <img src={film.image} alt="" loading="lazy" decoding="async" draggable={false} />
          <span className="card-shade" />
          <span className="card-mini-brand">m<span>.</span></span>
          <span className="card-art-title"><FilmTitle film={film} /></span>
          <span className="card-open-hint" aria-hidden="true"><Icon name="arrow-up-right" /></span>
        </button>
        {film.tier === 'plus' && <span className="card-badge">PLUS</span>}
      </div>
      <div className="card-info">
        <div>
          <h3 className="sr-only">{film.title}</h3>
          <div className="card-subline">
            <span>{getGenreLabel(film, lang)}</span>
            <span className="card-meta-dot" aria-hidden="true">·</span>
            <span>{film.language}</span>
          </div>
        </div>
        <button
          type="button"
          className={`card-save ${isSaved ? 'is-saved' : ''}`}
          aria-pressed={isSaved}
          aria-label={saveLabel}
          title={t(isSaved ? 'added' : 'add')}
          onClick={handleSave}
        >
          <Icon name={isSaved ? 'check' : 'plus'} />
        </button>
      </div>
    </article>
  );
}
