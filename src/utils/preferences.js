import { catalogue, languages, plans } from '../data/catalogue.js';

export const DEFAULT_PREFERENCES = {
  lang: 'fr', audio: 'fr', saved: [], plan: 'discovery', profile: 0,
  names: ['Vous', 'Invité 1', 'Invité 2', 'Invité 3'], libraryView: 'binder',
};

function browserStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function readPreference(key, fallback, storage = browserStorage()) {
  try { return JSON.parse(storage?.getItem(`mboa.${key}`)) ?? fallback; }
  catch { return fallback; }
}

export function writePreference(key, value, storage = browserStorage()) {
  try { storage?.setItem(`mboa.${key}`, JSON.stringify(value)); }
  catch { /* The interface also works when browser storage is unavailable. */ }
}

export function loadPreferences(storage = browserStorage()) {
  const raw = Object.fromEntries(Object.entries(DEFAULT_PREFERENCES).map(([key, fallback]) => [key, readPreference(key, fallback, storage)]));
  const filmIds = new Set(catalogue.map(film => film.id));
  return {
    lang: raw.lang === 'en' ? 'en' : 'fr',
    audio: languages.some(language => language.code !== 'all' && language.code === raw.audio) ? raw.audio : 'fr',
    saved: Array.isArray(raw.saved) ? [...new Set(raw.saved.filter(id => filmIds.has(id) || (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))))] : [],
    plan: plans.some(plan => plan.id === raw.plan) ? raw.plan : 'discovery',
    profile: Number.isInteger(raw.profile) && raw.profile >= 0 && raw.profile < 4 ? raw.profile : 0,
    names: DEFAULT_PREFERENCES.names.map((fallback, index) => {
      const name = Array.isArray(raw.names) ? raw.names[index] : null;
      return typeof name === 'string' && name.trim() ? name.trim().slice(0, 24) : fallback;
    }),
    libraryView: raw.libraryView === 'grid' ? 'grid' : 'binder',
  };
}

export function removePreferences(storage = browserStorage()) {
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    try { storage?.removeItem(`mboa.${key}`); }
    catch { /* Clearing in-memory preferences remains possible. */ }
  }
}
