import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { languages, plans } from '../data/catalogue.js';
import { useCatalogue } from './CatalogContext.jsx';
import { strings } from '../data/translations.js';
import { DEFAULT_PREFERENCES, loadPreferences, removePreferences, writePreference } from '../utils/preferences.js';

const AppContext = createContext(null);
const routes = ['accueil', 'films', 'histoires', 'ma-liste', 'abonnements', 'connexion', 'admin', 'compte'];
const readRoute = () => {
  const value = window.location.hash.slice(1).split('?')[0];
  return routes.includes(value) ? value : 'accueil';
};

export function AppProvider({ children }) {
  const catalog = useCatalogue();
  const { catalogue } = catalog;
  const [preferences, setPreferences] = useState(loadPreferences);
  const [route, setRoute] = useState(readRoute);
  const [genre, setGenre] = useState('all');
  const [filterLang, setFilterLang] = useState('all');
  const [binderSelection, setBinderSelections] = useState({});
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const t = useCallback(key => {
    if (!catalog.isDemoCatalogue && key === 'binderPresentation') return preferences.lang === 'fr' ? 'À découvrir sur Epizo' : 'Discover on Epizo';
    if (!catalog.isDemoCatalogue && key === 'filmsDesc') return preferences.lang === 'fr' ? 'Des films, des regards, des voyages. Trouvez votre prochaine séance.' : 'Films, perspectives and journeys. Find your next watch.';
    if (!catalog.isDemoCatalogue && key === 'originalVersion') return preferences.lang === 'fr' ? 'Langue originale' : 'Original language';
    if (!catalog.isDemoCatalogue && key === 'included') return preferences.lang === 'fr' ? 'Disponible avec' : 'Available with';
    if (!catalog.isDemoCatalogue && key === 'faq4a') return preferences.lang === 'fr' ? 'Le catalogue présente les titres publiés par notre équipe. La lecture nécessite un abonnement actif. Les paiements ne sont pas encore ouverts sur cette version.' : 'The catalogue shows titles published by our team. Playback requires an active subscription. Payments are not open in this version yet.';
    return strings[preferences.lang][key] ?? strings.fr[key] ?? key;
  }, [preferences.lang, catalog.isDemoCatalogue]);
  const notify = useCallback(message => setToast({ message, id: Date.now() + Math.random() }), []);
  const openModal = useCallback((type, payload = {}) => setModal({ type, ...payload }), []);
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    for (const [key, value] of Object.entries(preferences)) writePreference(key, value);
    document.documentElement.lang = preferences.lang;
  }, [preferences]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#main') return;
      setModal(null);
      setRoute(readRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback(next => {
    const target = routes.includes(next) ? next : 'accueil';
    setModal(null);
    setRoute(target);
    if (window.location.hash !== `#${target}`) window.location.hash = target;
  }, []);

  const toggleSaved = useCallback(id => {
    if (!catalogue.some(film => film.id === id)) return;
    const adding = !preferences.saved.includes(id);
    setPreferences(previous => ({ ...previous, saved: previous.saved.includes(id) ? previous.saved.filter(value => value !== id) : [...previous.saved, id] }));
    notify(t(adding ? 'savedToast' : 'removedToast'));
  }, [catalogue, preferences.saved, notify, t]);

  const setPlan = useCallback(id => {
    if (plans.some(plan => plan.id === id)) setPreferences(previous => ({ ...previous, plan: id }));
  }, []);

  const setProfile = useCallback(index => {
    if (Number.isInteger(index) && index >= 0 && index < 4) setPreferences(previous => ({ ...previous, profile: index }));
  }, []);

  const saveProfileName = useCallback(name => {
    const value = String(name ?? '').trim().slice(0, 24);
    if (!value) return;
    setPreferences(previous => ({ ...previous, names: previous.names.map((current, index) => index === previous.profile ? value : current) }));
  }, []);

  const saveLanguages = useCallback((lang, audio) => {
    setPreferences(previous => ({
      ...previous, lang: lang === 'en' ? 'en' : 'fr',
      audio: languages.some(language => language.code !== 'all' && language.code === audio) ? audio : 'fr',
    }));
  }, []);

  const setLibraryView = useCallback(value => {
    setPreferences(previous => ({ ...previous, libraryView: value === 'grid' ? 'grid' : 'binder' }));
  }, []);

  const setBinderSelection = useCallback((key, id) => {
    if (!catalogue.some(film => film.id === id)) return;
    setBinderSelections(previous => previous[key] === id ? previous : { ...previous, [key]: id });
  }, [catalogue]);

  const resetFilters = useCallback(() => { setGenre('all'); setFilterLang('all'); }, []);

  const clearDemoData = useCallback(() => {
    removePreferences();
    setPreferences({ ...DEFAULT_PREFERENCES, saved: [], names: [...DEFAULT_PREFERENCES.names] });
    setGenre('all'); setFilterLang('all'); setBinderSelections({});
  }, []);

  return <AppContext.Provider value={{
    ...preferences, ...catalog, route, genre, setGenre, filterLang, setFilterLang, resetFilters,
    libraryView: preferences.libraryView, setLibraryView, binderSelection, setBinderSelection,
    modal, openModal, closeModal, toast, notify, t, navigate, toggleSaved,
    setPlan, setProfile, saveProfileName, saveLanguages, clearDemoData,
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
