import { createClient, type SupabaseClient, type User, type JwtPayload } from 'npm:@supabase/supabase-js@2.118.0';
import { HttpError, allowedOrigin, configuredOrigins, requireStaffRole } from './security.mjs';

export type Context = {
  user: User;
  claims: JwtPayload;
  role: string;
  client: SupabaseClient;
  service: SupabaseClient;
};

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, 'NOT_CONFIGURED', 'Le service doit être configuré.');
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function authenticate(request: Request): Promise<Context> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || authorization.length > 16384) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Connectez-vous pour continuer.');
  }
  const token = authorization.slice(7);
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // getUser contacts Auth; getClaims cryptographically verifies JWT signatures.
  // Merely decoding a JWT must never establish role, user identity or AAL2.
  const [userResult, claimsResult] = await Promise.all([client.auth.getUser(token), client.auth.getClaims(token)]);
  const user = userResult.data?.user;
  const claims = claimsResult.data?.claims;
  if (userResult.error || claimsResult.error || !user || !claims || claims.sub !== user.id ||
      claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Votre session a expiré. Reconnectez-vous.');
  }
  const service = serviceClient();
  const roleResult = await service.from('user_roles').select('role').eq('user_id', user.id).single();
  if (roleResult.error || !roleResult.data) throw new HttpError(503, 'BACKEND_UNAVAILABLE', 'Le compte n’est pas encore disponible.');
  return { user, claims, role: roleResult.data.role, client, service };
}

export async function audit(context: Pick<Context, 'service' | 'user'>, kind: string, severity = 'info', details: Record<string, unknown> = {}, source = 'server') {
  // Callers supply fixed diagnostic codes and IDs, never raw request payloads.
  const { error } = await context.service.from('security_events').insert({ user_id: context.user.id, kind, severity, source, details });
  if (error) console.error(JSON.stringify({ kind: 'audit_write_failed', eventKind: kind }));
}

export async function requireStaff(context: Context, adminOnly = false) {
  try {
    requireStaffRole(context.role, context.claims, adminOnly);
  } catch (error) {
    await audit(context, 'admin_access_denied', 'warning', { reason: error instanceof HttpError ? error.code : 'FORBIDDEN' });
    throw error;
  }
}

export async function rateLimit(context: Pick<Context, 'service' | 'user'>, scope: string, limit: number, seconds: number) {
  const result = await context.service.rpc('consume_rate_limit', { p_key: `${scope}:${context.user.id}`, p_limit: limit, p_window_seconds: seconds });
  if (result.error) throw new HttpError(503, 'BACKEND_UNAVAILABLE', 'Le service est momentanément indisponible.');
  if (result.data !== true) throw new HttpError(429, 'RATE_LIMITED', 'Trop de demandes. Réessayez dans quelques instants.');
}

export function databaseError(error: { code?: string } | null, conflictCode = 'INVALID_STATE'): never {
  if (error?.code === '42501') throw new HttpError(403, 'FORBIDDEN', 'Cette opération n’est pas autorisée.');
  if (error?.code === 'P0002') throw new HttpError(404, 'CONTENT_UNAVAILABLE', 'Contenu introuvable.');
  if (error?.code === 'P0001' || error?.code === '23505') throw new HttpError(409, conflictCode, 'Vérifiez la vidéo, son affiche et les informations requises.');
  throw new HttpError(503, 'BACKEND_UNAVAILABLE', 'Le service est momentanément indisponible.');
}

export async function readTextBounded(request: Request, limit: number): Promise<string> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > limit) throw new HttpError(413, 'INVALID_INPUT', 'Requête trop volumineuse.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, 'INVALID_INPUT', 'Requête trop volumineuse.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function readJson(request: Request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'INVALID_INPUT', 'Format JSON attendu.');
  try {
    const data = JSON.parse(await readTextBounded(request, 16384));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required');
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_INPUT', 'Requête JSON invalide.');
  }
}

export function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

export function failure(error: unknown, requestId: string, headers: HeadersInit = {}) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  // Provider responses, Authorization and signed URLs never enter logs.
  console.error(JSON.stringify({ requestId, code, status }));
  return jsonResponse({ error: known ? error.message : 'Une erreur est survenue. Réessayez plus tard.', code, requestId }, status, headers);
}

export function apiHandler(handler: (body: Record<string, unknown>, request: Request) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    let headers: Record<string, string> = { Vary: 'Origin', 'X-Request-ID': requestId };
    try {
      const origin = request.headers.get('Origin');
      if (!allowedOrigin(origin, configuredOrigins(requiredEnv('APP_ORIGIN')))) throw new HttpError(403, 'ORIGIN_DENIED', 'Origine non autorisée.');
      if (origin) headers = { ...headers, 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Max-Age': '600' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      return jsonResponse(await handler(await readJson(request), request), 200, headers);
    } catch (error) { return failure(error, requestId, headers); }
  };
}

export function streamConfig() {
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new HttpError(503, 'NOT_CONFIGURED', 'Le service vidéo doit être configuré.');
  return { base: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, token: requiredEnv('CLOUDFLARE_STREAM_API_TOKEN') };
}

export async function streamFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = streamConfig();
  let response: Response;
  try {
    response = await fetch(config.base + path, { ...init, headers: { Authorization: `Bearer ${config.token}`, ...init.headers }, signal: AbortSignal.timeout(25000), redirect: 'error' });
  } catch { throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le service vidéo est momentanément indisponible.'); }
  if (!response.ok) throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le service vidéo est momentanément indisponible.');
  return response;
}

export async function streamJson(path: string, init: RequestInit = {}) {
  const response = await streamFetch(path, init);
  const body = await response.json();
  if (body.success !== true || !body.result) throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le service vidéo est momentanément indisponible.');
  return body.result;
}

export async function applyStreamState(service: SupabaseClient, state: Record<string, unknown>) {
  const result = await service.rpc('apply_video_status', state);
  if (result.error) databaseError(result.error);
  return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
}
