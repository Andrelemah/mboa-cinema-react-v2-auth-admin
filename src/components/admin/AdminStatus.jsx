import Icon from '../Icon.jsx';

const labels = {
  draft: ['Brouillon', 'muted'], published: ['Publié', 'green'], archived: ['Archivé', 'muted'],
  pending: ['À charger', 'muted'], uploading: ['Envoi en cours', 'blue'], processing: ['Traitement', 'blue'],
  ready: ['Prête', 'green'], error: ['À vérifier', 'red'], info: ['Information', 'muted'],
  warning: ['À vérifier', 'amber'], critical: ['Prioritaire', 'red'],
};

export function StatusBadge({ status, children }) {
  const [label, tone] = labels[status] || [status || '—', 'muted'];
  return <span className={`admin-badge tone-${tone}`}><span aria-hidden="true" />{children || label}</span>;
}

export function formatDate(value, { time = true } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala', day: '2-digit', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  }).format(date);
}

export function formatActivity(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '—';
  if (value <= 0) return '0 min';
  const minutes = Math.floor(value / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function EmptyState({ icon = 'library', title, children, action }) {
  return <div className="admin-empty"><span className="admin-empty-icon"><Icon name={icon} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function RequestError({ message, onRetry }) {
  return <div className="admin-request-error" role="alert"><Icon name="info" /><div><strong>Les données ne sont pas disponibles.</strong><p>{message}</p></div>{onRetry && <button className="admin-button secondary" onClick={onRetry}>Réessayer</button>}</div>;
}

export function LoadingState({ text = 'Chargement des données…' }) {
  return <div className="admin-loading" role="status"><span className="admin-loader" aria-hidden="true" />{text}</div>;
}
