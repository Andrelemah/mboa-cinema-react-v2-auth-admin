import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { adminAction } from '../../services/admin.js';
import { EmptyState, LoadingState, RequestError, StatusBadge, formatDate } from './AdminStatus.jsx';

const eventNames = {
  admin_access_denied: 'Accès administratif refusé', authorization_denied: 'Autorisation refusée',
  video_processing_failed: 'Échec du traitement vidéo', upload_created: 'Chargement vidéo autorisé',
  content_published: 'Contenu publié', content_archived: 'Contenu archivé',
  playback_denied: 'Lecture non autorisée', client_error: 'Signalement du navigateur',
  video_ready: 'Vidéo prête', upload_failed: 'Erreur de chargement',
};

export default function SecurityPanel({ preview, revision }) {
  const [data, setData] = useState({ events: [], alerts: [] });
  const [severity, setSeverity] = useState('all');
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return undefined;
    let current = true;
    setLoading(true); setError('');
    adminAction('security').then(result => { if (current) setData(result); })
      .catch(problem => { if (current) setError(problem.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [preview, revision, retry]);
  const visible = data.events.filter(event => severity === 'all' || event.severity === severity);
  return <div className="admin-security-page">
    <div className="admin-security-intro"><span><Icon name="shield" /></span><div><h2>Comprendre les signaux. Vérifier les faits.</h2><p>Les refus d’accès et les erreurs sont regroupés ici pour être examinés. Un signal ne signifie pas automatiquement qu’une intrusion a eu lieu.</p></div></div>
    {error && <RequestError message={error} onRetry={() => setRetry(value => value + 1)} />}
    {!error && data.alerts.length > 0 && <section className="admin-panel"><div className="admin-panel-heading"><h2>Signaux à vérifier</h2><span className="admin-subtle">Fenêtres de détection indiquées</span></div><div className="admin-alert-list">{data.alerts.map((alert, index) => <div className="admin-alert" key={`${alert.kind}-${index}`}><Icon name="shield" /><div><strong>{alert.title}</strong><p>{alert.count} événement(s) sur {alert.windowMinutes} minutes</p></div><StatusBadge status={alert.severity} /></div>)}</div></section>}
    <section className="admin-panel"><div className="admin-library-toolbar"><div><p className="admin-eyebrow">JOURNAL DES ÉVÉNEMENTS</p><h2>Ce qui s’est passé</h2></div><select aria-label="Filtrer la gravité des événements" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">Tous les niveaux</option><option value="info">Informations</option><option value="warning">À vérifier</option><option value="critical">Prioritaires</option></select></div>
      {loading ? <LoadingState /> : error ? <p className="admin-panel-footnote">Le journal n’a pas pu être chargé.</p> : visible.length ? <div className="admin-table-scroll"><table className="admin-table admin-events-table"><thead><tr><th>Date et heure</th><th>Événement</th><th>Niveau</th><th>Source</th></tr></thead><tbody>{visible.map(event => <tr key={event.id}><td className="admin-nowrap">{formatDate(event.created_at)}</td><td><strong>{eventNames[event.kind] || String(event.kind || 'Événement').replaceAll('_', ' ')}</strong>{event.details?.action && <small className="admin-event-context">Action : {String(event.details.action).slice(0, 80)}</small>}</td><td><StatusBadge status={event.severity} /></td><td>{event.source === 'client' ? <span className="admin-client-signal">Navigateur · non vérifié</span> : 'Serveur'}</td></tr>)}</tbody></table></div> : <EmptyState icon="shield" title={preview ? 'Le journal sera alimenté par vos services' : 'Aucun événement dans cette sélection'}>{preview ? 'Les événements réels apparaîtront une fois le backend connecté. Aucun contrôle d’intrusion n’est actif dans cet aperçu.' : 'Cette vue présente les événements reçus par la plateforme, selon le filtre choisi.'}</EmptyState>}
      <p className="admin-panel-footnote">Le journal applicatif complète les journaux d’authentification du fournisseur et la surveillance de votre hébergement. Les signaux navigateur sont déclaratifs.</p>
    </section>
  </div>;
}
