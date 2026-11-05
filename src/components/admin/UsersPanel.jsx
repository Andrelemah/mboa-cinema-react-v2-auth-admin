import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { adminAction } from '../../services/admin.js';
import { EmptyState, LoadingState, RequestError, formatActivity, formatDate } from './AdminStatus.jsx';

const roleLabel = role => ({ admin: 'Administrateur', editor: 'Éditeur', member: 'Membre' }[role] || 'Membre');

export default function UsersPanel({ preview, revision }) {
  const [result, setResult] = useState({ users: [], hasMore: false });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return undefined;
    let current = true;
    setLoading(true); setError('');
    adminAction('users', { page, perPage: 50 }).then(data => { if (current) { setResult(data); setSelected(null); } })
      .catch(problem => { if (current) setError(problem.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [preview, revision, page, retry]);
  const visible = result.users.filter(person => [person.display_name, person.email, person.phone].join(' ').toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  return <div className={`admin-users-layout${selected ? ' has-selection' : ''}`}>
    <section className="admin-panel"><div className="admin-library-toolbar"><label className="admin-search"><Icon name="search" /><input type="search" placeholder="Filtrer les utilisateurs de cette page…" aria-label="Filtrer cette page d’utilisateurs" value={query} onChange={event => setQuery(event.target.value)} /></label><span className="admin-subtle">Présence estimée · 30 derniers jours</span></div>
      {error ? <RequestError message={error} onRetry={() => setRetry(value => value + 1)} /> : loading ? <LoadingState /> : visible.length ? <><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Dernière activité</th><th>Présence estimée</th><th><span className="sr-only">Détails</span></th></tr></thead><tbody>{visible.map(person => { const contact = person.email || person.phone; return <tr key={person.id} className={selected?.id === person.id ? 'selected' : ''}><td><button className="admin-person" onClick={() => setSelected(person)}><span className="admin-person-avatar">{(person.display_name || contact || 'M').slice(0, 1).toUpperCase()}</span><span><strong>{person.display_name || 'Membre Epizo'}</strong><small>{contact || 'Contact non disponible'}</small></span></button></td><td>{roleLabel(person.role)}</td><td className="admin-nowrap">{formatDate(person.last_seen_at)}</td><td>{formatActivity(person.activity_seconds)}</td><td><button className="admin-icon-button" aria-label={`Voir l’activité de ${person.display_name || 'ce membre'}`} onClick={() => setSelected(person)}><Icon name="chevron-right" /></button></td></tr>; })}</tbody></table></div><div className="admin-pagination"><span>Page {page} · {result.users.length} compte(s)</span><div><button className="admin-button secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Précédent</button><button className="admin-button secondary" disabled={!result.hasMore} onClick={() => setPage(value => value + 1)}>Suivant</button></div></div></> : <EmptyState icon="users" title={preview ? 'Votre communauté prendra place ici' : query ? 'Aucun utilisateur sur cette page' : 'Aucun compte à afficher'}>{preview ? 'Les comptes créés par e-mail, SMS, Google ou Apple seront réunis dans cette vue.' : query ? 'Modifiez votre filtre ou consultez une autre page.' : 'Les nouvelles inscriptions apparaîtront après la création des comptes.'}</EmptyState>}
      <p className="admin-panel-footnote">Ces mesures concernent uniquement la présence observée dans Epizo. Elles ne prouvent ni un visionnage continu ni l’identité de la personne devant l’écran.</p>
    </section>
    {selected && <aside className="admin-panel admin-user-detail" aria-labelledby="admin-user-title"><div className="admin-panel-heading"><p className="admin-eyebrow">FICHE UTILISATEUR</p><button className="admin-icon-button" aria-label="Fermer la fiche utilisateur" onClick={() => setSelected(null)}><Icon name="x" /></button></div><span className="admin-person-avatar large">{(selected.display_name || selected.email || selected.phone || 'M').slice(0, 1).toUpperCase()}</span><h2 id="admin-user-title">{selected.display_name || 'Membre Epizo'}</h2><p className="admin-user-email">{selected.email || selected.phone || 'Contact non disponible'}</p><dl><div><dt>Rôle</dt><dd>{roleLabel(selected.role)}</dd></div><div><dt>Inscription</dt><dd>{formatDate(selected.created_at, { time: false })}</dd></div><div><dt>Dernière connexion</dt><dd>{formatDate(selected.last_sign_in_at)}</dd></div><div><dt>Dernière présence</dt><dd>{formatDate(selected.last_seen_at)}</dd></div><div><dt>Présence sur 30 jours</dt><dd>{formatActivity(selected.activity_seconds)}</dd></div></dl><p className="admin-panel-footnote">Dates et heures affichées dans le fuseau du Cameroun.</p></aside>}
  </div>;
}
