import { languages } from '../data/catalogue.js';

export function durationLabel(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const minutes = Math.max(1, Math.round(value / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}

export function mapPublishedContent(row, posterUrl) {
  return {
    id: row.id, title: row.title, tagline: row.synopsis,
    description: row.synopsis, descriptionEn: row.synopsis_en || row.synopsis,
    year: row.year, duration: durationLabel(row.duration_seconds),
    durationSeconds: Number(row.duration_seconds) || 0, genre: row.genre,
    language: languages.find(item => item.code === row.language_code)?.label || row.language_code,
    languageCode: row.language_code, image: posterUrl, tier: row.tier,
    type: row.content_type, featured: Boolean(row.featured), demo: false,
    available: row.status === 'published', languageStatus: 'published',
    hue: '#a37852', publishedAt: row.published_at,
  };
}

export function selectHeroFilms(items) {
  const featured = items.filter(film => film.featured);
  return [...featured, ...items.filter(film => !film.featured)].slice(0, 3);
}

export function safePlayerUrl(value) {
  try {
    const url = new URL(value);
    const allowed = url.hostname === 'iframe.videodelivery.net'
      || /^customer-[a-z0-9-]+\.cloudflarestream\.com$/i.test(url.hostname);
    return allowed && url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
