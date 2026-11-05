import { createClient } from '@supabase/supabase-js';

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const publicKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const placeholder = value => !value || /your[-_ ]|replace[-_ ]|example|placeholder|<|>/i.test(value);

function validProjectUrl(value) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

// Only publishable keys or the older anon key belong in the browser bundle.
// A service-role/secret key is deliberately rejected even if accidentally pasted here.
function isPublicKey(value) {
  if (value.startsWith('sb_publishable_')) return value.length > 24;
  if (value.startsWith('sb_secret_')) return false;
  try {
    const part = value.split('.')[1];
    if (!part) return false;
    const payload = JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export const backendConfigured = !placeholder(rawUrl) && !placeholder(publicKey)
  && validProjectUrl(rawUrl) && isPublicKey(publicKey);

export const oauthProviders = Object.freeze({
  google: backendConfigured && import.meta.env.VITE_AUTH_GOOGLE_ENABLED === 'true',
  apple: backendConfigured && import.meta.env.VITE_AUTH_APPLE_ENABLED === 'true',
});

export const supabase = backendConfigured ? createClient(rawUrl, publicKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;

/** Same-origin callback only. No return URL supplied by a visitor is accepted. */
export function authRedirectTo(purpose = 'signin') {
  const url = new URL(import.meta.env.BASE_URL || './', window.location.href);
  url.search = '';
  url.hash = 'connexion';
  if (purpose === 'recovery') url.searchParams.set('auth_action', 'recovery');
  return url.toString();
}
