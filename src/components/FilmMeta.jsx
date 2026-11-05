import { useApp } from '../context/AppContext.jsx';
import { getGenreLabel } from '../utils/catalogue.js';

export default function FilmMeta({ film }) {
  const { lang } = useApp();

  return (
    <div className="film-meta">
      <span>{getGenreLabel(film, lang)}</span>
      <span className="meta-dot" aria-hidden="true" />
      <span>{film.duration}</span>
      <span className="meta-dot" aria-hidden="true" />
      <span>{film.language}</span>
    </div>
  );
}
