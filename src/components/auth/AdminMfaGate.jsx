import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { supabase } from '../../lib/supabase.js';
import Icon from '../Icon.jsx';
import '../../styles/auth.css';

const messages = {
  fr: {
    eyebrow: 'EPIZO · ACCÈS ÉQUIPE', title: 'Une clé de plus pour vos histoires.',
    lead: 'L’administration est protégée par une vérification en deux étapes.',
    enrolTitle: 'Configurer une application d’authentification',
    enrolCopy: 'Ajoutez Epizo dans votre application d’authentification. Elle générera un code temporaire pour vos prochaines connexions à l’administration.',
    enrolButton: 'Configurer mon application', qr: 'QR code de configuration de votre authentification Epizo',
    scan: 'Scannez ce QR code avec votre application, puis saisissez le code à 6 chiffres qu’elle affiche.',
    private: 'Ce QR code et cette clé sont personnels. Gardez cet écran ouvert pendant la configuration et ne les partagez pas.',
    manual: 'Saisir la clé manuellement', code: 'Code de vérification', codeHelp: 'Le code à 6 chiffres affiché dans votre application.',
    verify: 'Vérifier et accéder', challenge: 'Ouvrez votre application d’authentification et saisissez le code temporaire de votre compte Epizo.',
    loading: 'Vérification de votre accès…', busy: 'Un instant…', error: 'La vérification n’a pas abouti. Vérifiez le code et l’heure de votre appareil, puis réessayez.',
    loadError: 'Impossible de charger vos méthodes de vérification. Réessayez dans un instant.', enrolError: 'La configuration n’a pas abouti. Réessayez dans un instant.',
    retry: 'Réessayer', cancel: 'Annuler cette configuration', back: 'Retour à Epizo', logout: 'Se déconnecter',
    unavailable: 'Connectez-vous avec votre compte équipe pour continuer.', signin: 'Se connecter',
    recovery: 'Si vous n’avez plus accès à votre application, contactez la personne qui administre votre équipe. Cette page ne peut pas contourner la vérification.',
    factor: 'Application d’authentification', pending: 'Une ancienne configuration n’a pas été terminée.',
    clearPending: 'Supprimer les configurations inachevées', validCode: 'Saisissez les 6 chiffres du code.',
    verified: 'Votre accès est vérifié.',
  },
  en: {
    eyebrow: 'EPIZO · TEAM ACCESS', title: 'One more key to your stories.',
    lead: 'Administration is protected with two-step verification.',
    enrolTitle: 'Set up an authenticator app',
    enrolCopy: 'Add Epizo to your authenticator app. It will generate a temporary code for future administration sign-ins.',
    enrolButton: 'Set up my app', qr: 'QR code for your Epizo authenticator setup',
    scan: 'Scan this QR code with your authenticator app, then enter the 6-digit code it displays.',
    private: 'This QR code and key are private. Keep this screen open during setup and do not share them.',
    manual: 'Enter the key manually', code: 'Verification code', codeHelp: 'The 6-digit code shown in your authenticator app.',
    verify: 'Verify and continue', challenge: 'Open your authenticator app and enter the temporary code for your Epizo account.',
    loading: 'Checking your access…', busy: 'One moment…', error: 'Verification was unsuccessful. Check the code and your device’s time, then try again.',
    loadError: 'Your verification methods could not be loaded. Please try again shortly.', enrolError: 'Setup could not be completed. Please try again shortly.',
    retry: 'Try again', cancel: 'Cancel this setup', back: 'Back to Epizo', logout: 'Sign out',
    unavailable: 'Sign in with your team account to continue.', signin: 'Sign in',
    recovery: 'If you no longer have access to your authenticator, contact your team administrator. This page cannot bypass verification.',
    factor: 'Authenticator app', pending: 'An earlier setup was not completed.',
    clearPending: 'Remove unfinished setups', validCode: 'Enter all 6 digits of the code.',
    verified: 'Your access is verified.',
  },
};

function qrImage(value) {
  // Supabase returns an SVG or its data URL. Never insert SVG markup into the DOM.
  if (value?.startsWith('data:image/svg+xml')) return value;
  if (value?.trimStart().startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  return null;
}

export default function AdminMfaGate({ children, onVerified }) {
  const auth = useAuth();
  const { lang, navigate } = useApp();
  const copy = messages[lang] || messages.fr;
  const inputId = useId();
  const [factors, setFactors] = useState([]);
  const [pendingFactors, setPendingFactors] = useState([]);
  const [factorId, setFactorId] = useState('');
  const [enrolment, setEnrolment] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const userId = auth.user?.id;

  const loadFactors = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!supabase || !userId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: failure } = await supabase.auth.mfa.listFactors();
      if (request !== requestVersion.current) return;
      if (failure) throw failure;
      const all = data?.all || data?.totp || [];
      const verified = all.filter(factor => factor.factor_type === 'totp' && factor.status === 'verified');
      setFactors(verified);
      setPendingFactors(all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified'));
      setFactorId(verified[0]?.id || '');
    } catch {
      if (request === requestVersion.current) setError('loadError');
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setEnrolment(null); setCode('');
    void loadFactors();
    return () => { requestVersion.current += 1; };
  }, [loadFactors]);

  async function enrol() {
    if (!supabase || busy) return;
    setBusy(true); setError(''); setCode('');
    const request = requestVersion.current;
    try {
      const { data, error: failure } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Epizo ${new Date().toISOString().slice(0, 16)}`, issuer: 'Epizo' });
      if (request !== requestVersion.current) return;
      if (failure || !data?.id || !data.totp?.secret) throw failure || new Error('Setup unavailable');
      setEnrolment({ id: data.id, qr: qrImage(data.totp.qr_code), secret: data.totp.secret });
      setFactorId(data.id);
    } catch { if (request === requestVersion.current) setError('enrolError'); }
    finally { if (request === requestVersion.current) setBusy(false); }
  }

  async function verify(event) {
    event.preventDefault();
    if (!supabase || busy || !factorId) return;
    if (!/^\d{6}$/.test(code)) { setError('validCode'); return; }
    setBusy(true); setError('');
    const request = requestVersion.current;
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data?.id) throw challenge.error || new Error('Challenge unavailable');
      const verification = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (request !== requestVersion.current) return;
      if (verification.error) throw verification.error;
      setCode(''); setEnrolment(null);
      const result = await auth.refreshIdentity();
      if (result.error || result.data?.aal !== 'aal2') throw result.error || new Error('Assurance unavailable');
      onVerified?.();
    } catch { if (request === requestVersion.current) { setCode(''); setError('error'); } }
    finally { if (request === requestVersion.current) setBusy(false); }
  }

  async function cancelEnrolment() {
    if (!supabase || !enrolment || busy) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.mfa.unenroll({ factorId: enrolment.id });
      if (failure) throw failure;
      setEnrolment(null); setCode('');
      await loadFactors();
    } catch { setError('enrolError'); }
    finally { setBusy(false); }
  }

  async function removePending() {
    if (!supabase || busy || enrolment) return;
    setBusy(true); setError('');
    try {
      for (const factor of pendingFactors) {
        const { error: failure } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (failure) throw failure;
      }
      await loadFactors();
    } catch { setError('enrolError'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    const result = await auth.signOut();
    setBusy(false);
    if (result.error) setError('loadError');
  }

  if (auth.isStaff) return children || <div className="mfa-shell"><p className="auth-lead" role="status">{copy.verified}</p></div>;

  return <section className="mfa-shell" aria-labelledby="mfa-title">
    <div className="mfa-card">
      <div className="auth-state-icon"><Icon name="shield" /></div>
      <p className="auth-eyebrow">{copy.eyebrow}</p>
      <h1 id="mfa-title">{copy.title}</h1>
      <p className="auth-lead">{copy.lead}</p>

      {!auth.configured || !auth.user || !auth.isStaffRole ? <>
        <p className="auth-notice">{copy.unavailable}</p>
        <button type="button" className="auth-primary" onClick={() => navigate('connexion')}>{copy.signin}<Icon name="arrow-right" /></button>
      </> : loading ? <div className="auth-loading" role="status"><span className="auth-spinner" />{copy.loading}</div> : error === 'loadError' ? <div className="auth-notice auth-notice-error" role="alert"><p>{copy.loadError}</p><button type="button" className="auth-text-button" onClick={loadFactors}>{copy.retry}</button></div> : <>
        {!factorId ? <div className="mfa-enrol-intro"><h2>{copy.enrolTitle}</h2><p>{copy.enrolCopy}</p><button type="button" className="auth-primary" onClick={enrol} disabled={busy}>{busy ? copy.busy : copy.enrolButton}<Icon name="arrow-right" /></button></div> : <>
          {enrolment ? <div className="mfa-enrolment">
            <p>{copy.scan}</p>
            {enrolment.qr && <img className="mfa-qr" src={enrolment.qr} alt={copy.qr} width="208" height="208" />}
            <details className="mfa-manual-key"><summary>{copy.manual}</summary><code>{enrolment.secret}</code><span>Epizo</span></details>
            <p className="auth-input-hint">{copy.private}</p>
          </div> : <p className="mfa-challenge-copy">{copy.challenge}</p>}
          <form className="auth-form mfa-code-form" onSubmit={verify} aria-busy={busy}>
            {factors.length > 1 && !enrolment && <div className="auth-field"><label htmlFor={`${inputId}-factor`}>{copy.factor}</label><select id={`${inputId}-factor`} value={factorId} onChange={event => { setFactorId(event.target.value); setCode(''); }} disabled={busy}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `${copy.factor} ${index + 1}`}</option>)}</select></div>}
            <div className="auth-field"><label htmlFor={`${inputId}-code`}>{copy.code}</label><input className="mfa-code" id={`${inputId}-code`} name="totp-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} aria-describedby={`${inputId}-help`} placeholder="000000" /><p className="auth-input-hint" id={`${inputId}-help`}>{copy.codeHelp}</p></div>
            {error && error !== 'loadError' && <p className="auth-error" role="alert">{copy[error] || copy.error}</p>}
            <button className="auth-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? copy.busy : copy.verify}{busy ? <span className="auth-spinner" /> : <Icon name="arrow-right" />}</button>
          </form>
          {enrolment && <button type="button" className="auth-text-button mfa-cancel" disabled={busy} onClick={cancelEnrolment}>{copy.cancel}</button>}
        </>}
        {!factorId && error && <p className="auth-error" role="alert">{copy[error] || copy.error}</p>}
        {!!pendingFactors.length && !enrolment && <div className="mfa-pending"><p>{copy.pending}</p><button type="button" className="auth-text-button" onClick={removePending} disabled={busy}>{copy.clearPending}</button></div>}
        {factors.length > 0 && <p className="mfa-recovery-note">{copy.recovery}</p>}
      </>}

      <div className="mfa-footer"><button type="button" className="auth-text-button" onClick={() => navigate('accueil')}><Icon name="arrow-left" />{copy.back}</button>{auth.user && <button type="button" className="auth-text-button" onClick={logout} disabled={busy}>{copy.logout}</button>}</div>
    </div>
  </section>;
}
