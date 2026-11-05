const englishGenres = {
  Drame: 'Drama', Chronique: 'Slice of life', Thriller: 'Thriller',
  Récit: 'Story', 'Comédie dramatique': 'Comedy-drama', Comédie: 'Comedy', Aventure: 'Adventure',
};

export function getGenreLabel(film, lang = 'fr') {
  return lang === 'en' ? (englishGenres[film.genre] || film.genre) : film.genre;
}

export function getFilmDescription(film, lang = 'fr') {
  return lang === 'en' ? (film.descriptionEn || film.description) : film.description;
}

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('douala', 'duala');
}

export function searchFilms(items, query) {
  const normalized = normalizeSearch(query.trim());
  return items.filter(film => normalizeSearch([
    film.title, film.genre, getGenreLabel(film, 'en'), film.language,
    film.description, film.descriptionEn,
  ].join(' ')).includes(normalized));
}

export function filterCatalogue(items, { genre = 'all', language = 'all', route = 'films', saved = [] } = {}) {
  return items.filter(film => {
    if (route === 'histoires' && film.type !== 'story') return false;
    if (route === 'ma-liste' && !saved.includes(film.id)) return false;
    if (language !== 'all' && film.languageCode !== language) return false;
    if (genre === 'mobile') return film.tier === 'mobile';
    return genre === 'all' || film.genre === genre;
  });
}
