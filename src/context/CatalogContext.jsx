import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { catalogue as demoCatalogue } from '../data/catalogue.js';
import { supabase, backendConfigured } from '../lib/supabase.js';
import { mapPublishedContent } from '../utils/publishedContent.js';

const CatalogContext = createContext(null);
const demonstrationCatalogue = demoCatalogue.map(film => ({ ...film, demo: true }));
const columns = 'id,slug,title,synopsis,synopsis_en,content_type,genre,language_code,tier,status,poster_path,featured,duration_seconds,year,published_at';

export function CatalogProvider({ children }) {
  const [catalogue, setCatalogue] = useState(backendConfigured ? [] : demonstrationCatalogue);
  const [catalogueLoading, setLoading] = useState(backendConfigured);
  const [catalogueError, setError] = useState('');
  const request = useRef(0);

  const refreshCatalogue = useCallback(async () => {
    if (!supabase) return;
    const current = ++request.current;
    try {
      const { data, error } = await supabase.from('content_items').select(columns)
        .eq('status', 'published').order('published_at', { ascending: false });
      if (current !== request.current) return;
      if (error) throw error;
      const items = (data || []).map(row => {
        const poster = row.poster_path
          ? supabase.storage.from('posters').getPublicUrl(row.poster_path).data.publicUrl
          : 'assets/hero.webp';
        return mapPublishedContent(row, poster);
      });
      setCatalogue(items);
      setError('');
    } catch {
      if (current === request.current) setError('Le catalogue est momentanément indisponible. Réessayez dans un instant.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    refreshCatalogue();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refreshCatalogue(); };
    const timer = window.setInterval(visibleRefresh, 60000);
    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('mboa:catalogue-refresh', refreshCatalogue);
    const channel = supabase.channel('mboa-published-catalogue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, refreshCatalogue).subscribe();
    return () => {
      ++request.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', visibleRefresh);
      window.removeEventListener('mboa:catalogue-refresh', refreshCatalogue);
      supabase.removeChannel(channel);
    };
  }, [refreshCatalogue]);

  const findFilm = useCallback(id => catalogue.find(film => film.id === id), [catalogue]);
  return <CatalogContext.Provider value={{ catalogue, findFilm, catalogueLoading, catalogueError, refreshCatalogue, isDemoCatalogue: !backendConfigured }}>{children}</CatalogContext.Provider>;
}

export function useCatalogue() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalogue must be used inside CatalogProvider');
  return value;
}
