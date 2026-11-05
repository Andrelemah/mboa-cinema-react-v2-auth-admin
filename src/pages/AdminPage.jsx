import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import AdminMfaGate from '../components/auth/AdminMfaGate.jsx';
import DashboardPanels from '../components/admin/DashboardPanels.jsx';
import ContentLibrary from '../components/admin/ContentLibrary.jsx';
import ContentEditor from '../components/admin/ContentEditor.jsx';
import UsersPanel from '../components/admin/UsersPanel.jsx';
import SecurityPanel from '../components/admin/SecurityPanel.jsx';
import { LoadingState } from '../components/admin/AdminStatus.jsx';
import '../styles/admin.css';

const sections = [
  { id: 'overview', label: 'Vue d’ensemble', icon: 'grid', title: 'Votre plateforme, en vue d’ensemble.', description: 'Le catalogue, votre communauté et les événements qui comptent.', admin: true },
  { id: 'contents', label: 'Contenus', icon: 'library', title: 'Vos histoires. Votre catalogue.', description: 'Préparez, chargez et publiez les contenus que votre public découvrira.' },
  { id: 'users', label: 'Utilisateurs', icon: 'users', title: 'Une communauté à connaître.', description: 'Retrouvez les comptes et leur activité observée sur la plateforme.', admin: true },
  { id: 'security', label: 'Sécurité', icon: 'shield', title: 'Gardez une vue sur les événements.', description: 'Examinez les erreurs et les signaux d’accès qui demandent votre attention.', admin: true },
];

function AccessGate({ title, children, action, icon = 'lock' }) {
  return <section className="mboa-admin admin-access-page"><a href="#accueil" className="admin-brand">epizo<span>.</span><small>STUDIO</small></a><div className="admin-access-card"><span className="admin-access-icon"><Icon name={icon} /></span><p className="admin-eyebrow">ESPACE ADMINISTRATEUR</p><h1>{title}</h1><div className="admin-access-copy">{children}</div>{action}<a href="#accueil" className="admin-text-button"><Icon name="arrow-left" />Retour à Epizo</a></div></section>;
}

function AdminWorkspace({ auth, preview }) {
  const hasAdminViews = preview || auth.isAdmin;
  const [section, setSection] = useState(hasAdminViews ? 'overview' : 'contents');
  const [editor, setEditor] = useState(undefined);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [leaveState, setLeaveState] = useState({ hasChanges: false, busy: false });
  useEffect(() => { if (!hasAdminViews && section !== 'contents') setSection('contents'); }, [hasAdminViews, section]);
  const current = sections.find(item => item.id === section) || sections[0];
  const visibleSections = sections.filter(item => !item.admin || hasAdminViews);
  const role = auth.role === 'admin' ? 'Administrateur' : auth.role === 'editor' ? 'Éditeur de contenus' : 'Aperçu du studio';

  function canLeaveEditor() {
    if (preview || editor === undefined || (!leaveState.hasChanges && !leaveState.busy)) return true;
    setNotice(leaveState.busy
      ? 'Une opération est en cours. Attendez sa fin ou suspendez le transfert avant de quitter la fiche.'
      : 'Votre fiche contient des changements ou un transfert suspendu. Enregistrez-la ou utilisez « Tous les contenus » pour la quitter.');
    return false;
  }
  function switchSection(id) { if (!canLeaveEditor()) return; setEditor(undefined); setSection(id); setNotice(''); }
  function createContent() { setSection('contents'); setEditor(null); setNotice(''); }
  async function logout() {
    if (!canLeaveEditor()) return;
    setSigningOut(true); setNotice('');
    try { const result = await auth.signOut(); if (result?.error) setNotice('La déconnexion a échoué. Réessayez.'); else window.location.hash = 'accueil'; }
    catch { setNotice('La déconnexion a échoué. Réessayez.'); }
    finally { setSigningOut(false); }
  }

  return <div className="mboa-admin" onClickCapture={event => { if (event.target.closest('a[href]') && !canLeaveEditor()) event.preventDefault(); }}>
    <aside className="admin-sidebar"><a href="#accueil" className="admin-brand">epizo<span>.</span><small>STUDIO</small></a><div className="admin-workspace-label"><span className="admin-workspace-mark">E</span><div><strong>Epizo Cinéma</strong><small>Espace de production</small></div></div><p className="admin-nav-label">VOTRE PLATEFORME</p><nav aria-label="Navigation de l’administration">{visibleSections.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => switchSection(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'contents' && <span className="admin-nav-dot" />}</button>)}</nav><div className="admin-sidebar-bottom"><a href="#accueil"><Icon name="arrow-up-right" />Voir la plateforme</a><div className="admin-team"><span>{(auth.profile?.display_name || auth.user?.email || 'E').slice(0, 1).toUpperCase()}</span><div><strong>{auth.profile?.display_name || (preview ? 'Équipe Epizo' : auth.user?.email?.split('@')[0]) || 'Mon compte'}</strong><small>{role}</small></div></div>{!preview && <button className="admin-signout" disabled={signingOut} onClick={logout}>{signingOut ? 'Déconnexion…' : 'Se déconnecter'}</button>}</div></aside>
    <div className="admin-main"><header className="admin-topbar"><p>Studio <span>/</span> {editor !== undefined ? 'Fiche de contenu' : current.label}</p><div><span className={`admin-connection ${preview ? 'not-connected' : ''}`}><span />{preview ? 'Backend non connecté' : 'Double authentification active'}</span><a href="#accueil" className="admin-topbar-site">Epizo<Icon name="arrow-up-right" /></a></div></header>
      <div className="admin-main-body">
        {editor === undefined && <div className="admin-page-heading"><div><p className="admin-eyebrow">EPIZO STUDIO</p><h1>{current.title}</h1><p>{current.description}</p></div><button className="admin-button secondary" disabled={preview} onClick={() => setRevision(value => value + 1)}><Icon name="arrow-down" />Actualiser</button></div>}
        {preview && editor === undefined && <div className="admin-preview-banner"><span><Icon name="info" /></span><div><strong>Aperçu de votre espace administrateur</strong><p>Connectez vos services pour gérer les vrais contenus, comptes et événements. Les actions d’envoi et de publication sont désactivées.</p></div><a href="#connexion" className="admin-text-button">Voir la connexion<Icon name="arrow-up-right" /></a></div>}
        {notice && <div className="admin-inline-message error" role="alert">{notice}</div>}
        {editor !== undefined ? <ContentEditor key={editor?.id || 'new-content'} initialContent={editor} preview={preview} user={auth.user} onLeaveStateChange={setLeaveState} onClose={() => { setEditor(undefined); setNotice(''); setRevision(value => value + 1); }} onSaved={() => setRevision(value => value + 1)} onPublished={() => setRevision(value => value + 1)} />
          : section === 'overview' && hasAdminViews ? <DashboardPanels preview={preview} revision={revision} onOpenContent={createContent} onOpenSecurity={() => switchSection('security')} />
            : section === 'contents' ? <ContentLibrary preview={preview} revision={revision} onAdd={createContent} onOpen={setEditor} />
              : section === 'users' && hasAdminViews ? <UsersPanel preview={preview} revision={revision} />
                : section === 'security' && hasAdminViews ? <SecurityPanel preview={preview} revision={revision} /> : null}
        <footer className="admin-footer"><span>Epizo Studio</span><p>{preview ? 'Les données seront affichées après connexion des services.' : 'Les autorisations sont contrôlées par le serveur à chaque opération.'}</p><span>Cameroun · UTC+1</span></footer>
      </div>
    </div>
  </div>;
}

export default function AdminPage() {
  const auth = useAuth();
  if (!auth.configured) return <AdminWorkspace auth={auth} preview />;
  if (auth.loading) return <AccessGate title="Vérification de votre accès"><LoadingState text="Vérification de la session et des autorisations…" /></AccessGate>;
  if (!auth.user) return <AccessGate title="Votre studio commence par une connexion." action={<a href="#connexion?returnTo=admin" className="admin-button">Se connecter<Icon name="arrow-right" /></a>}><p>Connectez-vous avec un compte de l’équipe pour accéder à la gestion de la plateforme.</p></AccessGate>;
  if (auth.authError) return <AccessGate title="Vos autorisations n’ont pas pu être vérifiées." action={<button className="admin-button" onClick={auth.refreshIdentity}>Réessayer</button>}><p>Vérifiez votre connexion puis réessayez. Aucun accès administratif n’est accordé tant que cette vérification échoue.</p></AccessGate>;
  if (!auth.isStaffRole) return <AccessGate title="Cet espace est réservé à l’équipe." icon="shield"><p>Votre compte est connecté, mais il ne dispose pas d’un rôle d’édition ou d’administration.</p></AccessGate>;
  if (auth.requiresMfa || !auth.isStaff) return <div className="mboa-admin admin-mfa-page"><a href="#accueil" className="admin-brand">epizo<span>.</span><small>STUDIO</small></a><AdminMfaGate /></div>;
  return <AdminWorkspace auth={auth} preview={false} />;
}
