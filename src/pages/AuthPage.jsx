import { useEffect, useId, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { oauthProviders } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/auth/ProviderIcon.jsx';
import { authCopy, authenticationMessage } from '../components/auth/authCopy.js';
import '../styles/auth.css';

const safeRoutes = new Set(['accueil', 'films', 'histoires', 'ma-liste', 'abonnements', 'compte', 'admin']);
const returnKey = 'mboa.auth.return-route';

function readReturnRoute(preferred) {
  if (safeRoutes.has(preferred)) return preferred;
  const parameters = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (safeRoutes.has(parameters.get('returnTo'))) return parameters.get('returnTo');
  try {
    const remembered = window.sessionStorage.getItem(returnKey);
    if (safeRoutes.has(remembered)) return remembered;
  } catch { /* Storage may be unavailable; the home route remains usable. */ }
  return 'accueil';
}

function rememberReturnRoute(route) {
  try { window.sessionStorage.setItem(returnKey, safeRoutes.has(route) ? route : 'accueil'); }
  catch { /* Only a navigation preference is stored, never credentials. */ }
}

function clearRecoveryMarker() {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_action');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function PasswordField({ id, label, value, onChange, disabled, autoComplete = 'current-password', hint, minLength }) {
  const [visible, setVisible] = useState(false);
  const { lang } = useApp();
  const copy = authCopy[lang] || authCopy.fr;
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-input">
      <input id={id} name={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange}
        required disabled={disabled} autoComplete={autoComplete} minLength={minLength}
        aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" className="auth-password-toggle" onClick={() => setVisible(current => !current)}
        disabled={disabled} aria-label={visible ? copy.hide : copy.show} aria-pressed={visible}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m4 4 16 16" />}
        </svg>
      </button>
    </div>
    {hint && <p className="auth-input-hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}

export default function AuthPage({ returnTo }) {
  const { lang, navigate } = useApp();
  const auth = useAuth();
  const copy = authCopy[lang] || authCopy.fr;
  const formId = useId();
  const [destination] = useState(() => readReturnRoute(returnTo));
  const [mode, setMode] = useState('signin');
  const [authMethod, setAuthMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryIntent, setRecoveryIntent] = useState(() => new URL(window.location.href).searchParams.get('auth_action') === 'recovery');
  const effectiveMode = auth.recoveryMode ? 'recovery' : mode;
  const disabled = !auth.configured || busy || auth.loading;
  const recoveryExpired = recoveryIntent && !auth.recoveryMode && !auth.loading;

  useEffect(() => { rememberReturnRoute(destination); }, [destination]);
  useEffect(() => {
    setPassword(''); setConfirmation(''); setError('');
  }, [auth.recoveryMode]);

  function switchMode(next) {
    setError(''); setNotice('');
    setPassword(''); setConfirmation('');
    setPhoneCode(''); setPhoneCodeSent(false);
    if (recoveryIntent) { setRecoveryIntent(false); clearRecoveryMarker(); }
    setMode(next);
  }

  function switchAuthMethod(next) {
    setError(''); setNotice('');
    setPhoneCode(''); setPhoneCodeSent(false);
    setAuthMethod(next);
  }

  async function requestPhoneCode() {
    if (disabled) return;
    const normalizedPhone = phone.replace(/[\s()-]/g, '');
    setError(''); setNotice('');
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) { setError(copy.phoneInvalid); return; }
    setBusy(true);
    const result = await auth.sendPhoneOtp({ phone: normalizedPhone, displayName, shouldCreateUser: mode === 'signup' });
    setBusy(false);
    if (result.error) { setError(authenticationMessage(result.error, copy, 'phone')); return; }
    setPhone(normalizedPhone); setPhoneCodeSent(true); setNotice(copy.phoneCodeSent);
  }

  function continueTo(route) {
    try { window.sessionStorage.removeItem(returnKey); } catch { /* Optional preference. */ }
    navigate(safeRoutes.has(route) ? route : 'accueil');
  }

  async function backHome(event) {
    event.preventDefault();
    if (busy) return;
    if (auth.recoveryMode) {
      // Leaving recovery ends its authenticated session instead of hiding the form.
      setBusy(true); setError('');
      const result = await auth.signOut();
      setBusy(false);
      if (result.error) { setError(authenticationMessage(result.error, copy, 'logout')); return; }
    }
    setRecoveryIntent(false); clearRecoveryMarker();
    continueTo('accueil');
  }

  async function submit(event) {
    event.preventDefault();
    if (disabled) return;
    setError(''); setNotice('');
    if (authMethod === 'phone' && ['signin', 'signup'].includes(effectiveMode)) {
      const normalizedPhone = phone.replace(/[\s()-]/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) { setError(copy.phoneInvalid); return; }
      if (!phoneCodeSent) { await requestPhoneCode(); return; }
      setBusy(true);
      const result = await auth.verifyPhoneOtp({ phone: normalizedPhone, token: phoneCode.trim() });
      setBusy(false);
      if (result.error) { setError(authenticationMessage(result.error, copy, 'phone')); return; }
      setPhoneCode(''); setPhoneCodeSent(false);
      return;
    }
    if (effectiveMode === 'signup' || effectiveMode === 'recovery') {
      if (password.length < 12) { setError(copy.passwordShort); return; }
      if (password !== confirmation) { setError(copy.mismatch); return; }
    }
    setBusy(true);
    let result;
    if (effectiveMode === 'signin') result = await auth.signInWithPassword({ email, password });
    else if (effectiveMode === 'signup') result = await auth.signUpWithEmail({ email, password, displayName });
    else if (effectiveMode === 'forgot') result = await auth.requestPasswordReset(email);
    else result = await auth.updatePassword(password);
    setBusy(false);
    if (result.error) { setError(authenticationMessage(result.error, copy, effectiveMode)); return; }
    setPassword(''); setConfirmation('');
    if (effectiveMode === 'forgot') setNotice(copy.resetSuccess);
    else if (effectiveMode === 'signup') setNotice(result.data?.session ? copy.signupActive : copy.signupSuccess);
    else if (effectiveMode === 'recovery') {
      setRecoveryIntent(false); clearRecoveryMarker(); setMode('signin'); setNotice(copy.passwordSaved);
    }
    // The verified-account state provides the next action, including MFA for staff.
  }

  async function oauth(provider) {
    if (disabled || !oauthProviders[provider]) return;
    setError(''); setNotice(''); setBusy(true);
    rememberReturnRoute(destination);
    const result = await auth.signInWithProvider(provider);
    if (result.error) { setBusy(false); setError(authenticationMessage(result.error, copy)); }
  }

  async function logout() {
    setBusy(true); setError('');
    const result = await auth.signOut();
    setBusy(false);
    if (result.error) setError(authenticationMessage(result.error, copy, 'logout'));
  }

  async function retryIdentity() {
    setBusy(true); setError('');
    const result = await auth.refreshIdentity();
    setBusy(false);
    if (result.error) setError(copy.networkError);
  }

  const heading = effectiveMode === 'signup' ? copy.signupTitle : effectiveMode === 'forgot' ? copy.resetTitle : effectiveMode === 'recovery' ? copy.recoveryTitle : copy.signinTitle;
  const lead = effectiveMode === 'signup' ? copy.signupLead : effectiveMode === 'forgot' ? copy.resetLead : effectiveMode === 'recovery' ? copy.recoveryLead : copy.signinLead;
  const accountReady = auth.user && !auth.recoveryMode && !recoveryExpired;
  const accountIdentifier = auth.user?.email || auth.user?.phone || '';

  return <div className="auth-page">
    <header className="auth-header">
      <a className="auth-wordmark" href="#accueil" onClick={backHome} aria-label={auth.recoveryMode ? copy.cancelRecovery : copy.back}>epizo</a>
      <a className="auth-back" href="#accueil" onClick={backHome}><Icon name="arrow-left" />{auth.recoveryMode ? copy.cancelRecovery : copy.back}</a>
    </header>

    <div className="auth-layout">
      <section className="auth-scene" aria-labelledby="auth-story-title">
        <img className="auth-scene-image" src={`${import.meta.env.BASE_URL}assets/hero.webp`} alt="" />
        <div className="auth-scene-shade" />
        <div className="auth-scene-top"><span>EPIZO ORIGINALS</span><span>01 / CM</span></div>
        <div className="auth-story"><p className="auth-eyebrow">{copy.eyebrow}</p><h1 id="auth-story-title">{copy.title}</h1><p>{copy.story}</p></div>
        <p className="auth-scene-caption"><span />{copy.caption}</p>
      </section>

      <section className="auth-form-area" aria-labelledby="auth-form-title">
        <div className="auth-form-inner">
          {!accountReady && !auth.recoveryMode && !recoveryExpired && (mode === 'signin' || mode === 'signup') && <div className="auth-tabs" aria-label={lang === 'en' ? 'Account access' : 'Accès à votre compte'}>
            <button type="button" className={mode === 'signin' ? 'active' : ''} aria-pressed={mode === 'signin'} disabled={busy} onClick={() => switchMode('signin')}>{copy.signin}</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} aria-pressed={mode === 'signup'} disabled={busy} onClick={() => switchMode('signup')}>{copy.signup}</button>
          </div>}

          {!accountReady && !auth.recoveryMode && !recoveryExpired && (mode === 'signin' || mode === 'signup') && <div className="auth-method-tabs" role="group" aria-label={lang === 'en' ? 'Sign-in method' : 'Méthode de connexion'}>
            <button type="button" className={authMethod === 'email' ? 'active' : ''} aria-pressed={authMethod === 'email'} disabled={busy} onClick={() => switchAuthMethod('email')}>{copy.emailTab}</button>
            <button type="button" className={authMethod === 'phone' ? 'active' : ''} aria-pressed={authMethod === 'phone'} disabled={busy} onClick={() => switchAuthMethod('phone')}>{copy.phoneTab}</button>
          </div>}

          {auth.loading && !busy ? <div className="auth-loading" role="status"><span className="auth-spinner" />{copy.waiting}</div> : accountReady ? <>
            <div className="auth-state-icon"><Icon name="check" /></div>
            <p className="auth-eyebrow">EPIZO · {copy.eyebrow}</p>
            <h2 id="auth-form-title">{copy.signedInTitle}</h2>
            <p className="auth-lead">{copy.signedInLead}</p>
            <div className="auth-account-identity"><span>{(auth.profile?.display_name || accountIdentifier || 'E').slice(0, 1).toUpperCase()}</span><div><strong>{auth.profile?.display_name || (lang === 'en' ? 'My account' : 'Mon compte')}</strong><p>{accountIdentifier}</p></div></div>
            {auth.authError && <div className="auth-notice auth-notice-error" role="alert"><p>{copy.identityError}</p><button type="button" className="auth-text-button" onClick={retryIdentity} disabled={busy}>{copy.retry}</button></div>}
            {notice && <div className="auth-notice auth-notice-success" role="status">{notice}</div>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <div className="auth-account-actions">
              <button type="button" className="auth-primary" onClick={() => continueTo(destination === 'admin' && !auth.isStaffRole ? 'accueil' : destination)} disabled={busy}>{destination === 'admin' && auth.isStaffRole ? copy.admin : copy.continue}<Icon name="arrow-right" /></button>
              {auth.isStaffRole && destination !== 'admin' && <button type="button" className="auth-secondary" onClick={() => continueTo('admin')}>{copy.admin}<Icon name="shield" /></button>}
              <button type="button" className="auth-text-button" onClick={logout} disabled={busy}>{copy.logout}</button>
            </div>
          </> : recoveryExpired ? <>
            <div className="auth-state-icon"><Icon name="lock" /></div>
            <h2 id="auth-form-title">{copy.resetTitle}</h2>
            <p className="auth-lead">{copy.recoveryInvalid}</p>
            <button type="button" className="auth-primary" onClick={() => switchMode('forgot')}>{copy.newLink}<Icon name="arrow-right" /></button>
          </> : <>
            {(mode === 'forgot' || auth.recoveryMode) && <p className="auth-eyebrow">EPIZO · {copy.eyebrow}</p>}
            <h2 id="auth-form-title">{heading}</h2>
            <p className="auth-lead">{lead}</p>

            {!auth.configured && <div className="auth-notice auth-configuration" role="status"><Icon name="lock" /><div><strong>{copy.disabledTitle}</strong><p>{copy.disabledCopy}</p></div></div>}
            {destination === 'admin' && auth.configured && <p className="auth-team-notice"><Icon name="shield" />{copy.adminNotice}</p>}
            {auth.authError === 'callback_failed' && <p className="auth-error" role="alert">{copy.callbackError}</p>}
            {auth.authError === 'session_unavailable' && <p className="auth-error" role="alert">{copy.networkError}</p>}

            {authMethod === 'email' && (effectiveMode === 'signin' || effectiveMode === 'signup') && <>
              <div className="auth-providers">
                {['google', 'apple'].map(provider => <button type="button" key={provider} className={`auth-provider auth-provider-${provider}`} onClick={() => oauth(provider)} disabled={disabled || !oauthProviders[provider]} aria-describedby={!oauthProviders[provider] ? `${formId}-provider-note` : undefined}><ProviderIcon provider={provider} /><span>{copy[provider]}</span></button>)}
              </div>
              {(!oauthProviders.google || !oauthProviders.apple) && <p className="auth-provider-note" id={`${formId}-provider-note`}>{copy.unavailableProvider}</p>}
              <div className="auth-divider"><span />{copy.divider}<span /></div>
            </>}

            <form className="auth-form" onSubmit={submit} aria-busy={busy}>
              {authMethod === 'phone' && (effectiveMode === 'signin' || effectiveMode === 'signup') ? <>
                {effectiveMode === 'signup' && !phoneCodeSent && <div className="auth-field"><label htmlFor={`${formId}-name`}>{copy.name}</label><input id={`${formId}-name`} name="name" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={copy.namePlaceholder} maxLength={80} disabled={disabled} required /></div>}
                {!phoneCodeSent ? <div className="auth-field"><label htmlFor={`${formId}-phone`}>{copy.phone}</label><input id={`${formId}-phone`} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder={copy.phonePlaceholder} required disabled={disabled} aria-describedby={`${formId}-phone-hint`} /><p className="auth-input-hint" id={`${formId}-phone-hint`}>{copy.phoneHint}</p></div>
                  : <div className="auth-field"><label htmlFor={`${formId}-phone-code`}>{copy.phoneCode}</label><input id={`${formId}-phone-code`} name="phone-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={phoneCode} onChange={event => setPhoneCode(event.target.value)} placeholder={copy.phoneCodePlaceholder} required disabled={disabled} /></div>}
              </> : <>
                {effectiveMode === 'signup' && <div className="auth-field"><label htmlFor={`${formId}-name`}>{copy.name}</label><input id={`${formId}-name`} name="name" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={copy.namePlaceholder} maxLength={80} disabled={disabled} required /></div>}
                {effectiveMode !== 'recovery' && <div className="auth-field"><label htmlFor={`${formId}-email`}>{copy.email}</label><input id={`${formId}-email`} name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={copy.emailPlaceholder} required disabled={disabled} autoCapitalize="none" spellCheck="false" /></div>}
                {effectiveMode !== 'forgot' && <PasswordField id={`${formId}-password`} label={effectiveMode === 'recovery' ? copy.newPassword : copy.password} value={password} onChange={event => setPassword(event.target.value)} disabled={disabled} autoComplete={effectiveMode === 'signin' ? 'current-password' : 'new-password'} hint={effectiveMode !== 'signin' ? copy.passwordHint : undefined} minLength={effectiveMode === 'signin' ? undefined : 12} />}
                {(effectiveMode === 'signup' || effectiveMode === 'recovery') && <PasswordField id={`${formId}-confirmation`} label={copy.confirm} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={disabled} autoComplete="new-password" minLength={12} />}
                {effectiveMode === 'signin' && <button type="button" className="auth-forgot" disabled={busy} onClick={() => switchMode('forgot')}>{copy.forgot}</button>}
              </>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              {notice && <div className="auth-notice auth-notice-success" role="status">{notice}</div>}
              <button className="auth-primary" type="submit" disabled={disabled}>{busy ? copy.waiting : authMethod === 'phone' && (effectiveMode === 'signin' || effectiveMode === 'signup') ? phoneCodeSent ? copy.verifyPhoneCode : copy.sendPhoneCode : effectiveMode === 'signup' ? copy.signupButton : effectiveMode === 'forgot' ? copy.resetButton : effectiveMode === 'recovery' ? copy.recoveryButton : copy.signinButton}{busy ? <span className="auth-spinner" /> : <Icon name="arrow-right" />}</button>
            </form>
            {authMethod === 'phone' && phoneCodeSent && <div className="auth-phone-actions"><button type="button" className="auth-text-button" disabled={disabled} onClick={requestPhoneCode}>{copy.resendPhoneCode}</button><button type="button" className="auth-text-button" disabled={busy} onClick={() => { setPhoneCodeSent(false); setPhoneCode(''); setError(''); setNotice(''); }}>{copy.changePhone}</button></div>}
            {authMethod === 'email' && effectiveMode === 'forgot' && <button type="button" className="auth-text-button auth-return-signin" disabled={busy} onClick={() => switchMode('signin')}><Icon name="arrow-left" />{copy.signin}</button>}
            {auth.configured && <p className="auth-security-note"><Icon name="lock" />{copy.secure}</p>}
          </>}
        </div>
        <div className="auth-form-footer"><span>EPIZO</span><span>CAMEROUN · CAMEROON</span></div>
      </section>
    </div>
  </div>;
}
