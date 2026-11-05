import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authRedirectTo, backendConfigured, oauthProviders, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const emptyIdentity = { user: null, session: null, profile: null, role: 'member', aal: 'aal1' };
const configError = { code: 'not_configured', message: 'Authentication is not configured.' };
const transportError = { code: 'network_error', message: 'The authentication service is unavailable.' };

function cleanCallbackParameters() {
  const previousUrl = window.location.href;
  const url = new URL(previousUrl);
  const previousHash = url.hash;
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  if (/^#(?:access_token|error|refresh_token)=/.test(url.hash)) url.hash = 'connexion';
  if (url.toString() === previousUrl) return;
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  // replaceState does not notify a hash router, including OAuth error returns.
  if (url.hash !== previousHash) {
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previousUrl, newURL: url.toString() }));
  }
}

async function authCall(callback) {
  if (!supabase) return { data: null, error: configError };
  try { return await callback(); }
  catch { return { data: null, error: transportError }; }
}

export function AuthProvider({ children }) {
  const [identity, setIdentity] = useState(emptyIdentity);
  const [loading, setLoading] = useState(backendConfigured);
  const [authError, setAuthError] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const verifiedUserId = useRef(null);

  const loadIdentity = useCallback(async () => {
    const request = ++generation.current;
    if (!supabase) {
      if (mounted.current) { setIdentity(emptyIdentity); setLoading(false); }
      return { data: emptyIdentity, error: null };
    }
    // A same-user token refresh must not unmount an editor or an active player.
    // Account changes clear the verified identity synchronously in the listener.
    if (mounted.current && !verifiedUserId.current) setLoading(true);
    try {
      // Always read the current SDK session, never an old event snapshot.
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data.session;
      if (!session) {
        if (mounted.current && request === generation.current) {
          verifiedUserId.current = null;
          setIdentity(emptyIdentity); setLoading(false);
          cleanCallbackParameters();
        }
        return { data: emptyIdentity, error: null };
      }
      if (mounted.current && request === generation.current && session.user?.id !== verifiedUserId.current) {
        verifiedUserId.current = null;
        setIdentity(emptyIdentity); setLoading(true);
      }

      // getSession reads browser storage; getUser verifies the token with Auth.
      // Database roles and AAL only inform the UI. RLS and Edge Functions enforce access.
      const userResult = await supabase.auth.getUser(session.access_token);
      if (userResult.error || !userResult.data.user) throw userResult.error || transportError;
      const user = userResult.data.user;
      const [profileResult, roleResult, assuranceResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.rpc('get_my_role'),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const role = !roleResult.error && ['member', 'editor', 'admin'].includes(roleResult.data) ? roleResult.data : 'member';
      const aal = !assuranceResult.error && assuranceResult.data?.currentLevel === 'aal2' ? 'aal2' : 'aal1';
      const nextIdentity = { user, session, profile: profileResult.error ? null : profileResult.data, role, aal };
      const identityError = profileResult.error || roleResult.error || assuranceResult.error;
      if (mounted.current && request === generation.current) {
        verifiedUserId.current = user.id;
        setIdentity(nextIdentity);
        setAuthError(identityError ? 'identity_unavailable' : null);
        setLoading(false);
        cleanCallbackParameters();
      }
      return { data: nextIdentity, error: identityError ? { code: 'identity_unavailable', message: 'Account access could not be loaded.' } : null };
    } catch {
      if (mounted.current && request === generation.current) {
        verifiedUserId.current = null;
        setIdentity(emptyIdentity); setAuthError('session_unavailable'); setLoading(false);
        cleanCallbackParameters();
      }
      return { data: null, error: transportError };
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!supabase) { setLoading(false); return () => { mounted.current = false; }; }
    let pendingTimer = null;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('error') || /^#error=/.test(currentUrl.hash)) setAuthError('callback_failed');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      pendingTimer = null;
      // Invalidate in-flight identity reads before a newer session can be applied.
      generation.current += 1;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') {
        verifiedUserId.current = null;
        setIdentity(emptyIdentity); setRecoveryMode(false); setLoading(false); setAuthError(null);
        return;
      }
      if (session?.user?.id !== verifiedUserId.current) {
        setIdentity(emptyIdentity);
        setLoading(true);
      }
      // Supabase's callback is synchronous. SDK calls run after its auth lock is released.
      pendingTimer = window.setTimeout(() => { pendingTimer = null; void loadIdentity(); }, 0);
    });
    void loadIdentity();
    return () => {
      mounted.current = false; generation.current += 1;
      subscription.unsubscribe();
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    };
  }, [loadIdentity]);

  const signInWithPassword = useCallback(async ({ email, password }) => {
    const result = await authCall(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
    if (!result.error && result.data?.session) await loadIdentity();
    return result;
  }, [loadIdentity]);

  const signUpWithEmail = useCallback(({ email, password, displayName }) => authCall(() => supabase.auth.signUp({
    email: email.trim(), password,
    options: { emailRedirectTo: authRedirectTo(), data: { display_name: String(displayName || '').trim().slice(0, 80) } },
  })), []);

  const sendPhoneOtp = useCallback(({ phone, displayName, shouldCreateUser }) => authCall(() => supabase.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser,
      ...(shouldCreateUser && displayName ? { data: { display_name: String(displayName).trim().slice(0, 80) } } : {}),
    },
  })), []);

  const verifyPhoneOtp = useCallback(async ({ phone, token }) => {
    const result = await authCall(() => supabase.auth.verifyOtp({ phone, token, type: 'sms' }));
    if (!result.error && result.data?.session) await loadIdentity();
    return result;
  }, [loadIdentity]);

  const signInWithProvider = useCallback(provider => {
    if (!['google', 'apple'].includes(provider) || !oauthProviders[provider]) {
      return Promise.resolve({ data: null, error: { code: 'provider_disabled', message: 'This provider is not enabled.' } });
    }
    return authCall(() => supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectTo(),
        scopes: provider === 'google' ? 'openid email profile' : 'name email',
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    }));
  }, []);

  const requestPasswordReset = useCallback(email => authCall(() => supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectTo('recovery') })), []);

  const updatePassword = useCallback(async password => {
    // A URL flag never enables password recovery; only the Auth recovery event does.
    if (!recoveryMode || !identity.user) return { data: null, error: { code: 'recovery_required', message: 'Open a valid recovery link first.' } };
    const result = await authCall(() => supabase.auth.updateUser({ password }));
    if (!result.error) {
      setRecoveryMode(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_action');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return result;
  }, [identity.user, recoveryMode]);

  const signOut = useCallback(async () => {
    const result = await authCall(() => supabase.auth.signOut({ scope: 'local' }));
    if (!result.error) {
      generation.current += 1;
      verifiedUserId.current = null;
      setIdentity(emptyIdentity); setRecoveryMode(false); setAuthError(null);
    }
    return result;
  }, []);

  const isStaffRole = identity.role === 'editor' || identity.role === 'admin';
  const isAdminRole = identity.role === 'admin';
  return <AuthContext.Provider value={{
    ...identity, configured: backendConfigured, loading, authError, recoveryMode,
    isStaffRole, isAdminRole,
    requiresMfa: !!identity.user && isStaffRole && identity.aal !== 'aal2',
    isStaff: !!identity.user && !loading && !authError && isStaffRole && identity.aal === 'aal2',
    isAdmin: !!identity.user && !loading && !authError && isAdminRole && identity.aal === 'aal2',
    refreshIdentity: loadIdentity,
    signInWithPassword, signUpWithEmail, sendPhoneOtp, verifyPhoneOtp, signInWithProvider, requestPasswordReset, updatePassword, signOut,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
