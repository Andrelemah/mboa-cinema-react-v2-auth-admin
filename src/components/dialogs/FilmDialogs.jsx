import { useApp } from '../../context/AppContext.jsx';
import { getFilmDescription, getGenreLabel } from '../../utils/catalogue.js';
import Icon from '../Icon.jsx';
import FilmMeta from '../FilmMeta.jsx';
import ProtectedPlayer from '../ProtectedPlayer.jsx';

function MissingFilm() {
  const { t, closeModal } = useApp();
  return <div className="small-modal">
    <h2 id="modal-title">{t('noResults')}</h2>
    <p className="modal-description">{t('noResultsCopy')}</p>
    <button type="button" className="button" onClick={closeModal}>{t('close')}</button>
  </div>;
}

export function FilmDetailDialog({ filmId }) {
  const { t, lang, saved, toggleSaved, openModal, findFilm } = useApp();
  const film = findFilm(filmId);
  if (!film) return <MissingFilm />;
  const isSaved = saved.includes(film.id);

  return <>
    <div className="detail-art">
      <img src={film.image} alt="" />
      <div className="detail-heading">
        <div className="eyebrow">{t('original')}</div>
        <h2 id="modal-title">{film.title}</h2>
        <FilmMeta film={film} />
      </div>
    </div>
    <div className="detail-body">
      <div className="action-row">
        <button type="button" className="button" onClick={() => openModal('player', { filmId: film.id })}>
          <Icon name="play" />{film.demo ? t('previewPlayer') : lang === 'fr' ? 'Regarder' : 'Watch'}
        </button>
        <button type="button" className="button secondary" aria-pressed={isSaved} onClick={() => toggleSaved(film.id)}>
          <Icon name={isSaved ? 'check' : 'plus'} /><span>{t(isSaved ? 'added' : 'add')}</span>
        </button>
      </div>
      <div className="detail-columns">
        <p className="detail-description">{getFilmDescription(film, lang)}</p>
        <div className="detail-facts">
          <p><span>{t('originalVersion')} :</span> {film.language}</p>
          <p><span>{t('genre')} :</span> {getGenreLabel(film, lang)}</p>
          <p><span>{t('included')} :</span> {film.tier === 'plus' ? 'Plus' : t('mobileCatalogue')}</p>
        </div>
      </div>
      {film.demo && <p className="demo-note">{t('detailNote')}</p>}
    </div>
  </>;
}

export function PlayerDialog({ filmId }) {
  const { t, plan, openModal, findFilm } = useApp();
  const film = findFilm(filmId);
  if (!film) return <MissingFilm />;

  if (!film.demo) return <ProtectedPlayer film={film} />;

  if (plan === 'mobile' && film.tier === 'plus') {
    return <>
      <span className="success-icon"><Icon name="lock" /></span>
      <h2 id="modal-title">{t('plusRequired')}</h2>
      <p className="modal-description">{t('plusCopy')}</p>
      <button type="button" className="button" onClick={() => openModal('checkout', { planId: 'plus' })}>
        {t('tryPlus')}<Icon name="arrow-right" />
      </button>
      <button type="button" className="button ghost" onClick={() => openModal('detail', { filmId })}>
        {t('backDetail')}
      </button>
    </>;
  }

  return <>
    <div className="player-stage">
      <img src={film.image} alt="" />
      <div className="player-placeholder">
        <span className="player-icon"><Icon name="play" /></span>
        <h2 id="modal-title">{t('playerTitle')}</h2>
        <p>{t('playerCopy')}</p>
        <button type="button" className="button secondary" style={{ marginTop: 24 }} onClick={() => openModal('detail', { filmId })}>
          {t('backDetail')}
        </button>
      </div>
    </div>
    <div className="player-bar">
      <div><strong>{film.title}</strong><small>{t('playerLabel')}</small></div>
      <div className="player-tools">
        <button type="button" aria-label={t('audioLanguage')} onClick={() => openModal('languages')}><Icon name="headphones" /></button>
        <button type="button" aria-label={t('languageTitle')} onClick={() => openModal('languages')}><Icon name="captions" /></button>
      </div>
    </div>
  </>;
}
