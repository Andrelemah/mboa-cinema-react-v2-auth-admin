import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './context/AppContext.jsx';
import Icon from './components/Icon.jsx';
import ModalHost from './components/ModalHost.jsx';
import HomePage from './pages/HomePage.jsx';
import CataloguePage from './pages/CataloguePage.jsx';
import OffersPage from './pages/OffersPage.jsx';
import { useAuth } from './context/AuthContext.jsx';

const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));

const navigation = [
  { id: 'accueil', key: 'home', icon: 'home' },
  { id: 'films', key: 'films', icon: 'library' },
  { id: 'histoires', key: 'stories', icon: 'stories' },
  { id: 'ma-liste', key: 'list', icon: 'bookmark' },
];

function readPaymentReference() {
  const reference = new URL(window.location.href).searchParams.get('reference');
  return reference && /^[A-Za-z0-9_-]{8,100}$/.test(reference) ? reference : null;
}

function Brand() {
  const { lang } = useApp();
  return <a href="#accueil" className="brand" aria-label={lang === 'fr' ? 'Epizo, accueil' : 'Epizo, home'}>epizo<span className="brand-dot" /></a>;
}

function Header() {
  const { t, lang, route, profile, names, openModal } = useApp();
  const auth = useAuth();
  const displayName = auth.profile?.display_name || auth.user?.email || auth.user?.phone || names[profile];
  const [scrolled, setScrolled] = useState(() => window.scrollY > 32);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; setScrolled(window.scrollY > 32); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  return <header id="site-header" className={`site-header${route !== 'accueil' ? ' solid' : ''}${scrolled ? ' is-scrolled' : ''}`}>
    <Brand />
    <nav id="desktop-nav" className="desktop-nav" aria-label={lang === 'fr' ? 'Navigation principale' : 'Main navigation'}>
      {navigation.map(item => <a key={item.id} href={`#${item.id}`} className={route === item.id ? 'active' : ''} aria-current={route === item.id ? 'page' : undefined}>{t(item.key)}</a>)}
    </nav>
    <div className="header-actions">
      <button className="icon-button" id="open-search" aria-label={t('search')} onClick={() => openModal('search')}><Icon name="search" /></button>
      <button className="language-button" id="open-languages" aria-label={t('languageTitle')} onClick={() => openModal('languages')}>{lang.toUpperCase()} <Icon name="chevron-down" /></button>
      <a href="#abonnements" className="header-subscribe" id="header-subscribe">{t('choose')}<Icon name="arrow-up-right" /></a>
      {auth.user ? <a className="profile-button" id="open-account" aria-label={t('profile')} href="#compte"><span className="avatar" id="header-avatar">{displayName.slice(0, 1).toUpperCase()}</span><Icon name="chevron-down" /></a> : <a className="header-signin" id="open-account" href="#connexion">{lang === 'fr' ? 'Se connecter' : 'Sign in'}<Icon name="arrow-up-right" /></a>}
    </div>
  </header>;
}

function Footer() {
  const { t, lang, openModal, isDemoCatalogue } = useApp();
  const { configured, isStaffRole } = useAuth();
  return <footer className="site-footer" id="site-footer">
    <div className="footer-brand"><Brand /><p className="footer-tagline">{t('tagline')}</p></div>
    <div><div className="footer-links">
      {['help', 'about', 'privacy'].map(kind => <button key={kind} onClick={() => openModal('info', { kind })}>{t(kind)}</button>)}
      <button onClick={() => openModal('languages')}>{t('languageTitle')}</button>
      {(!configured || isStaffRole) && <a href="#admin">{lang === 'fr' ? 'Administration' : 'Administration'}</a>}
    </div><p className="footer-note">{isDemoCatalogue ? t('footerNote') : (lang === 'fr' ? 'Epizo · Films, histoires et voix du Cameroun.' : 'Epizo · Films, stories and voices from Cameroon.')}</p></div>
  </footer>;
}

function MobileNavigation() {
  const { lang, route, t } = useApp();
  return <nav className="mobile-nav" id="mobile-nav" aria-label={lang === 'fr' ? 'Navigation mobile' : 'Mobile navigation'}>
    {[...navigation, { id: 'abonnements', key: 'offers', icon: 'ticket' }].map(item => <a key={item.id} href={`#${item.id}`} className={route === item.id ? 'active' : ''} aria-current={route === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{t(item.key)}</span></a>)}
  </nav>;
}

export default function App() {
  const { route, lang, toast, closeModal, openModal } = useApp();
  const { recoveryMode, user } = useAuth();
  const [paymentReference] = useState(readPaymentReference);
  const paymentHandled = useRef(false);
  const onPaymentComplete = useCallback(() => { paymentHandled.current = true; }, []);
  const standalone = route === 'admin' || route === 'connexion' || recoveryMode;
  const mainRef = useRef(null);
  useEffect(() => {
    if (!paymentReference) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('reference') === paymentReference) {
      url.searchParams.delete('reference');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [paymentReference]);
  useEffect(() => {
    if (paymentReference && !recoveryMode && !paymentHandled.current) {
      openModal('payment-return', { reference: paymentReference, onComplete: onPaymentComplete });
    }
  }, [onPaymentComplete, openModal, paymentReference, recoveryMode, user?.id]);
  useEffect(() => {
    if (paymentReference && !recoveryMode) return;
    closeModal();
  }, [closeModal, paymentReference, recoveryMode, user?.id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (window.location.hash) mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  return <>
    <div id="app-shell">
      <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); mainRef.current?.focus(); }}>{lang === 'fr' ? 'Aller au contenu' : 'Skip to content'}</a>
      {!standalone && <Header />}
      <main id="main" tabIndex={-1} ref={mainRef}>
        <Suspense fallback={<section className="page service-state" role="status">{lang === 'fr' ? 'Chargement de votre espace…' : 'Loading your space…'}</section>}>
        {recoveryMode || route === 'connexion' ? <AuthPage /> : route === 'admin' ? <AdminPage /> : route === 'compte' ? <AccountPage /> : route === 'accueil' ? <HomePage /> : route === 'abonnements' ? <OffersPage /> : <CataloguePage />}
        </Suspense>
      </main>
      {!standalone && <Footer />}
      {!standalone && <MobileNavigation />}
    </div>
    <ModalHost />
    <div className={`toast${toast ? ' visible' : ''}`} id="toast" role="status" aria-live="polite">{toast?.message || ''}</div>
  </>;
}
