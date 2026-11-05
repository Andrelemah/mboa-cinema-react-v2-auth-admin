import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { adminAction } from '../../services/admin.js';
import { EmptyState, LoadingState, RequestError, StatusBadge, formatActivity } from './AdminStatus.jsx';

const integer = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('fr-FR').format(value);

function ActivityChart({ activity = [], preview }) {
  const max = Math.max(1, ...activity.map(item => Number(item.seconds) || 0));
  return <section className="admin-panel admin-activity-panel">
    <div className="admin-panel-heading"><div><p className="admin-eyebrow">PRÉSENCE SUR LA PLATEFORME</p><h2>Quand votre public se connecte</h2></div><span className="admin-subtle">24 dernières heures</span></div>
    {preview || activity.length === 0 ? <EmptyState icon="monitor" title={preview ? 'L’activité apparaîtra ici' : 'Pas encore d’activité enregistrée'}>{preview ? 'Connectez vos services pour suivre les connexions et la présence de vos utilisateurs.' : 'Les premières sessions alimenteront cette vue au fil de leur utilisation.'}</EmptyState>
      : <div className="admin-chart" role="img" aria-label="Présence estimée cumulée, par heure sur les dernières 24 heures">
        <div className="admin-chart-bars">{activity.map(item => {
          const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', timeZone: 'Africa/Douala' }).format(new Date(item.hour));
          return <div className="admin-chart-column" key={item.hour} title={`${hour} · ${formatActivity(item.seconds)}`}>
            <span className="admin-chart-bar" style={{ height: `${Math.max(1, Number(item.seconds) / max * 100)}%` }}><span className="sr-only">{hour} : {formatActivity(item.seconds)}</span></span><small>{hour}</small>
          </div>;
        })}</div>
      </div>}
    <p className="admin-panel-footnote">Heure du Cameroun · Présence estimée sur Epizo, distincte du temps de visionnage.</p>
  </section>;
}

export default function DashboardPanels({ preview, revision, onOpenContent, onOpenSecurity }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return undefined;
    let current = true;
    setLoading(true); setError('');
    adminAction('dashboard').then(result => { if (current) setData(result); })
      .catch(problem => { if (current) setError(problem.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [preview, revision, retry]);
  const stats = preview || error ? {} : data?.stats || {};
  const metrics = [
    { label: 'Utilisateurs inscrits', value: integer(stats.users), icon: 'users', note: 'Comptes de la plateforme' },
    { label: 'Contenus publiés', value: integer(stats.published), icon: 'film', note: 'Visibles dans le catalogue' },
    { label: 'Actifs aujourd’hui', value: integer(stats.activeToday), icon: 'monitor', note: 'Présence enregistrée' },
    { label: 'Signaux à vérifier', value: integer(stats.securityWarnings24h), icon: 'shield', note: 'Sur les dernières 24 heures' },
  ];
  return <>
    {error && <RequestError message={error} onRetry={() => setRetry(value => value + 1)} />}
    <div className="admin-stats">{metrics.map(metric => <article className="admin-stat" key={metric.label}><div><span>{metric.label}</span><Icon name={metric.icon} /></div><strong>{loading ? '…' : metric.value}</strong><p>{metric.note}</p></article>)}</div>
    {loading ? <LoadingState /> : <div className="admin-overview-grid">
      <ActivityChart preview={preview || Boolean(error)} activity={data?.activity || []} />
      <section className="admin-panel admin-production-panel"><p className="admin-eyebrow">DU STUDIO À L’ÉCRAN</p><h2>Votre prochain film<br />commence ici.</h2><p>Préparez sa fiche, ajoutez l’affiche et la vidéo, puis choisissez le moment de le publier.</p><ol className="admin-workflow"><li><span>01</span>Créer le brouillon</li><li><span>02</span>Charger les médias</li><li><span>03</span>Vérifier et publier</li></ol><button className="admin-button" onClick={onOpenContent}><Icon name="plus" />Préparer un contenu</button><div className="admin-production-counts"><span><strong>{integer(stats.drafts)}</strong> brouillons</span><span><strong>{integer(stats.processing)}</strong> vidéos en traitement</span></div></section>
      <section className="admin-panel admin-security-summary"><div className="admin-panel-heading"><div><p className="admin-eyebrow">VIGILANCE</p><h2>Événements à examiner</h2></div><button className="admin-text-button" onClick={onOpenSecurity}>Voir la sécurité<Icon name="arrow-up-right" /></button></div>
        {data?.alerts?.length && !preview && !error ? <div className="admin-alert-list">{data.alerts.slice(0, 3).map((alert, index) => <div className="admin-alert" key={`${alert.kind}-${index}`}><Icon name="shield" /><div><strong>{alert.title}</strong><p>{integer(alert.count)} événement(s) · {alert.windowMinutes} minutes</p></div><StatusBadge status={alert.severity} /></div>)}</div>
          : <div className="admin-quiet-state"><Icon name="shield" /><div><strong>{preview || error ? 'En attente de données' : 'Aucun signal à examiner dans cette fenêtre'}</strong><p>Les signaux sont calculés à partir des événements reçus. Ils ne constituent pas une preuve d’intrusion.</p></div></div>}
      </section>
    </div>}
  </>;
}
