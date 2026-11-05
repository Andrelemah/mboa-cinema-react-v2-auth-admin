import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { listContents, posterUrl } from '../../services/admin.js';
import { EmptyState, LoadingState, RequestError, StatusBadge, formatDate } from './AdminStatus.jsx';

export default function ContentLibrary({ preview, revision, onAdd, onOpen }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: null, hasMore: false });
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return undefined;
    let current = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      listContents({ query, status, page }).then(data => { if (current) setResult(data); })
        .catch(problem => { if (current) setError(problem.message); })
        .finally(() => { if (current) setLoading(false); });
    }, query ? 250 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [preview, revision, query, status, page, retry]);
  return <section className="admin-panel admin-content-library">
    <div className="admin-library-toolbar"><label className="admin-search"><Icon name="search" /><input type="search" placeholder="Rechercher un titre…" aria-label="Rechercher un contenu" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><select aria-label="Statut du contenu" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Tous les statuts</option><option value="draft">Brouillons</option><option value="published">Publiés</option><option value="archived">Archivés</option></select><button className="admin-button" onClick={onAdd}><Icon name="plus" />Nouveau contenu</button></div>
    {error ? <RequestError message={error} onRetry={() => setRetry(value => value + 1)} /> : loading ? <LoadingState /> : result.items.length ? <>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Contenu</th><th>Rubrique</th><th>Publication</th><th>Vidéo</th><th>Accès</th><th>Mis à jour</th><th><span className="sr-only">Ouvrir</span></th></tr></thead><tbody>{result.items.map(item => <tr key={item.id}><td><button className="admin-content-name" onClick={() => onOpen(item)}><span className="admin-table-poster">{item.poster_path ? <img src={posterUrl(item.poster_path)} alt="" /> : <Icon name="film" />}</span><span><strong>{item.title || 'Sans titre'}</strong><small>{item.language_code?.toUpperCase()} · {item.genre || 'Genre à préciser'}</small></span></button></td><td>{item.content_type === 'story' ? 'Histoires' : 'Films'}</td><td><StatusBadge status={item.status} /></td><td><StatusBadge status={item.asset?.status || 'pending'} /></td><td>{item.tier === 'plus' ? 'Plus' : 'Mobile + Plus'}</td><td className="admin-nowrap">{formatDate(item.updated_at)}</td><td><button className="admin-icon-button" aria-label={`Ouvrir ${item.title}`} onClick={() => onOpen(item)}><Icon name="arrow-up-right" /></button></td></tr>)}</tbody></table></div>
      <div className="admin-pagination"><span>{result.total} contenu(s) · page {page}</span><div><button className="admin-button secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Précédent</button><button className="admin-button secondary" disabled={!result.hasMore} onClick={() => setPage(value => value + 1)}>Suivant</button></div></div>
    </> : <EmptyState title={preview ? 'Le futur catalogue se prépare ici' : query || status !== 'all' ? 'Aucun contenu ne correspond' : 'Votre premier contenu vous attend'}>{preview ? 'Les fiches créées et les vidéos chargées apparaîtront ici après connexion du backend.' : query || status !== 'all' ? 'Essayez un autre titre ou un autre statut.' : 'Ajoutez un titre, son affiche et sa vidéo. Le contenu restera hors du catalogue jusqu’à sa publication.'}{/* No seeded films are presented as managed production content. */}</EmptyState>}
  </section>;
}
