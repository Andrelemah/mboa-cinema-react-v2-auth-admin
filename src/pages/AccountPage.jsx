import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

export default function AccountPage() {
  const auth = useAuth();
  const { lang, navigate, notify } = useApp();
  const text = (fr, en) => lang === 'en' ? en : fr;
  const accountIdentifier = auth.user?.email || auth.user?.phone || '';
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionState, setSubscriptionState] = useState({ userId: null, value: null, error: false, loading: true });
  const subscription = subscriptionState.userId === auth.user?.id ? subscriptionState.value : null;
  const subscriptionError = subscriptionState.userId === auth.user?.id && subscriptionState.error;
  const subscriptionLoading = subscriptionState.userId !== auth.user?.id || subscriptionState.loading;

  useEffect(() => { setName(auth.profile?.display_name || ''); }, [auth.profile?.display_name, auth.user?.id]);
  useEffect(() => {
    let cancelled = false;
    setSubscriptionState({ userId: auth.user?.id, value: null, error: false, loading: true });
    if (!supabase || !auth.user) return undefined;
    supabase.from('subscriptions').select('plan,status,starts_at,expires_at').eq('user_id', auth.user.id)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setSubscriptionState({ userId: auth.user.id, loading: false, error: Boolean(queryError), value: (data || []).find(item => item.status === 'active' && Date.parse(item.starts_at) <= Date.now() && Date.parse(item.expires_at) > Date.now()) || null });
      }).catch(() => { if (!cancelled) setSubscriptionState({ userId: auth.user.id, loading: false, value: null, error: true }); });
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  async function saveName(event) {
    event.preventDefault();
    if (!supabase || !auth.user || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', auth.user.id);
      if (result.error) throw result.error;
      await auth.refreshIdentity();
      notify(text('Profil enregistré.', 'Profile saved.'));
    } catch { setError(text('Le profil n’a pas pu être enregistré.', 'Your profile could not be saved.')); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    const result = await auth.signOut();
    setBusy(false);
    if (result.error) { setError(text('La déconnexion a échoué. Réessayez.', 'Sign-out failed. Please try again.')); return; }
    navigate('connexion');
  }

  if (auth.loading) return <section className="page service-state" role="status">{text('Chargement de votre compte…', 'Loading your account…')}</section>;
  if (!auth.user) return <section className="page service-state"><p className="eyebrow">EPIZO</p><h1>{text('Votre espace vous attend.', 'Your space is waiting.')}</h1><p>{text('Connectez-vous pour retrouver votre compte.', 'Sign in to access your account.')}</p><a className="button" href="#connexion?returnTo=compte">{text('Se connecter', 'Sign in')}<Icon name="arrow-right" /></a></section>;

  return <section className="page account-page">
    <div className="page-heading"><div><p className="eyebrow">{text('VOTRE ESPACE EPIZO', 'YOUR EPIZO SPACE')}</p><h1>{text('Mon compte', 'My account')}</h1><p>{accountIdentifier}</p></div><button className="button ghost" disabled={busy} onClick={logout}>{text('Se déconnecter', 'Sign out')}</button></div>
    <div className="account-page-grid">
      <article className="account-panel"><h2>{text('Votre profil', 'Your profile')}</h2><form onSubmit={saveName}><label className="field-label" htmlFor="account-display-name">{text('Nom affiché', 'Display name')}</label><input id="account-display-name" className="form-input" value={name} maxLength={80} required onChange={event => setName(event.target.value)} autoComplete="nickname" /><button className="button" disabled={busy || !name.trim()}>{busy ? text('Enregistrement…', 'Saving…') : text('Enregistrer', 'Save')}</button></form>{error && <p className="service-error" role="alert">{error}</p>}</article>
      <article className="account-panel"><h2>{text('Votre offre', 'Your plan')}</h2><p className="account-plan-name">{subscriptionLoading ? text('Chargement…', 'Loading…') : subscriptionError ? text('Information indisponible', 'Information unavailable') : subscription?.plan === 'plus' ? 'Plus' : subscription?.plan === 'mobile' ? 'Mobile' : text('Découverte', 'Discovery')}</p><p>{subscription ? text('Votre accès est vérifié par le service lors de chaque demande de lecture.', 'Your access is checked by the service when you request playback.') : text('Vous pouvez explorer le catalogue. La lecture nécessite un abonnement actif.', 'You can explore the catalogue. Playback requires an active subscription.')}</p><a className="text-link" href="#abonnements">{text('Voir les offres', 'View plans')}<Icon name="arrow-up-right" /></a></article>
      <article className="account-panel"><h2>{text('Sécurité du compte', 'Account security')}</h2><p>{auth.user.phone ? auth.user.phone_confirmed_at ? text('Numéro de téléphone vérifié.', 'Phone number verified.') : text('Vérifiez votre numéro de téléphone.', 'Verify your phone number.') : auth.user.email_confirmed_at ? text('Adresse e-mail vérifiée.', 'Email address verified.') : text('Vérifiez votre adresse e-mail pour terminer l’inscription.', 'Verify your email address to finish registration.')}</p><p>{text('Les mots de passe, les codes SMS et les connexions Google ou Apple sont gérés par le service d’authentification.', 'Passwords, SMS codes and Google or Apple sign-ins are handled by the authentication service.')}</p>{auth.isStaffRole && <a className="button secondary" href="#admin"><Icon name="shield" />{text('Accéder à l’administration', 'Open administration')}</a>}</article>
      <article className="account-panel"><h2>{text('Votre activité', 'Your activity')}</h2><p>{text('Quand vous êtes connecté et que Epizo est visible, le service enregistre votre présence pour le suivi d’activité et le diagnostic. Il ne s’agit pas d’une mesure exacte du visionnage.', 'When you are signed in and Epizo is visible, the service records presence for activity reporting and diagnostics. This is not an exact measurement of viewing time.')}</p><button className="text-link" onClick={() => navigate('films')}>{text('Retrouver la bibliothèque', 'Back to the library')}<Icon name="arrow-right" /></button></article>
    </div>
  </section>;
}
