import { supabase } from '../lib/supabase.js';

export async function invokeFunction(name, body) {
  if (!supabase) return { data: null, error: { code: 'not_configured', message: 'Le service n’est pas encore configuré.' } };
  try {
    const result = await supabase.functions.invoke(name, { body });
    if (!result.error) return result;
    let payload;
    try { payload = await result.error.context?.json(); } catch { /* Non-JSON gateway response. */ }
    return { data: null, error: {
      code: payload?.code || 'request_failed', status: result.error.context?.status,
      message: payload?.error || 'La demande n’a pas pu aboutir. Réessayez dans un instant.',
      requestId: payload?.requestId,
    } };
  } catch {
    return { data: null, error: { code: 'network_error', message: 'La connexion au service est momentanément indisponible.' } };
  }
}
