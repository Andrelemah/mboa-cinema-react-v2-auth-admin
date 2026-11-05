/** Pure security decisions shared by Edge Functions and executable Node tests. */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const VIDEO_UID_RE = /^[a-f0-9]{32}$/;
export const ROUTES = new Set(['accueil', 'films', 'histoires', 'ma-liste', 'abonnements', 'admin', 'connexion', 'compte']);
export const DIAGNOSTIC_COMPONENTS = new Set(['Player', 'Catalogue', 'Auth', 'Admin', 'App']);

export function requireUuid(value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new HttpError(400, 'INVALID_INPUT', 'Identifiant invalide.');
  return value.toLowerCase();
}

export function configuredOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(503, 'NOT_CONFIGURED', 'Le service doit être configuré.');
  const origins = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    try {
      const url = new URL(origin);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return url.origin !== origin || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'));
    } catch { return true; }
  })) throw new HttpError(503, 'NOT_CONFIGURED', 'Les origines du service doivent être configurées.');
  return [...new Set(origins)];
}

export function allowedOrigin(origin, origins) {
  // Non-browser API clients have no Origin; JWT authentication still applies.
  return origin === null || origins.includes(origin);
}

export function isStaff(role, claims) {
  return ['editor', 'admin'].includes(role) && claims?.aal === 'aal2';
}

export function requireStaffRole(role, claims, adminOnly = false) {
  if (!['editor', 'admin'].includes(role) || (adminOnly && role !== 'admin')) {
    throw new HttpError(403, 'FORBIDDEN', 'Cet espace est réservé au personnel autorisé.');
  }
  if (claims?.aal !== 'aal2') throw new HttpError(403, 'MFA_REQUIRED', 'Validez votre authentification à deux facteurs.');
}

export function validateUpload(body, maxBytes = 10 * 1024 ** 3) {
  const contentId = requireUuid(body.contentId);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new HttpError(503, 'NOT_CONFIGURED', 'Limite de transfert non configurée.');
  if (!Number.isSafeInteger(body.fileSize) || body.fileSize <= 0 || body.fileSize > maxBytes) {
    throw new HttpError(400, 'INVALID_INPUT', 'La taille du fichier dépasse la limite autorisée.');
  }
  if (!Number.isInteger(body.maxDurationSeconds) || body.maxDurationSeconds < 1 || body.maxDurationSeconds > 14400) {
    throw new HttpError(400, 'INVALID_INPUT', 'La durée maximale doit être comprise entre 1 seconde et 4 heures.');
  }
  const fileType = String(body.fileType ?? '').toLowerCase();
  if (!['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'].includes(fileType)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Format vidéo non pris en charge.');
  }
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  if (!fileName || fileName.length > 160 || /[\x00-\x1f\x7f/\\]/.test(fileName)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Nom de fichier invalide.');
  }
  return { contentId, fileSize: body.fileSize, fileType, fileName, maxDurationSeconds: body.maxDurationSeconds };
}

export function base64Utf8(value) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(String(value))));
}

export function validateUploadLocation(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        (url.hostname.endsWith('.videodelivery.net') || url.hostname.endsWith('.cloudflarestream.com'))) return url.href;
  } catch { /* fail closed */ }
  throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le service vidéo est momentanément indisponible.');
}

export async function verifyWebhookSignature(rawBody, header, secret, nowSeconds = Date.now() / 1000) {
  if (typeof secret !== 'string' || secret.length < 16 || typeof header !== 'string' || header.length > 1024) return false;
  const fields = header.split(',').map((part) => part.trim().split('='));
  if (fields.some((pair) => pair.length !== 2)) return false;
  const times = fields.filter(([key]) => key === 'time');
  const signatures = fields.filter(([key]) => key === 'sig1');
  if (times.length !== 1 || signatures.length !== 1 || !/^\d{10}$/.test(times[0][1]) || !/^[a-f0-9]{64}$/i.test(signatures[0][1])) return false;
  const timestamp = Number(times[0][1]);
  if (!Number.isFinite(nowSeconds) || nowSeconds - timestamp > 300 || timestamp - nowSeconds > 60) return false;
  const signature = Uint8Array.from(signatures[0][1].match(/.{2}/g), (pair) => parseInt(pair, 16));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`${timestamp}.${rawBody}`));
}

export async function verifyPaystackSignature(rawBody, signature, secret) {
  if (typeof secret !== 'string' || secret.length < 16 || typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/.{2}/g), pair => parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(rawBody));
}

export function streamState(video) {
  if (!video || !VIDEO_UID_RE.test(video.uid ?? '') || !Number.isFinite(Date.parse(video.modified))) {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Réponse vidéo invalide.');
  }
  const state = video.status?.state;
  const duration = Number(video.duration ?? 0);
  let status = 'processing';
  let reason = null;
  if (video.requireSignedURLs !== true) {
    status = 'error'; reason = 'signed_playback_required';
  } else if (state === 'error') {
    status = 'error'; reason = 'provider_processing_error';
  } else if (state === 'ready' && video.readyToStream === true && Number.isFinite(duration) && duration > 0 && duration <= 86400) {
    status = 'ready';
  } else if (['pendingupload', 'downloading', 'queued'].includes(state)) {
    status = 'uploading';
  }
  return {
    p_provider_uid: video.uid, p_status: status,
    p_duration: Number.isFinite(duration) && duration >= 0 && duration <= 86400 ? duration : 0,
    p_error: reason, p_modified: new Date(video.modified).toISOString(),
  };
}

export function playbackExpiry({ content, asset, subscription, role, claims, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!content || !asset || asset.status !== 'ready' || !VIDEO_UID_RE.test(asset.provider_uid ?? '') || !(Number(asset.duration_seconds) > 0)) {
    throw new HttpError(409, 'VIDEO_NOT_READY', 'Cette vidéo n’est pas encore disponible.');
  }
  const preview = isStaff(role, claims);
  if (!preview && content.status !== 'published') throw new HttpError(403, 'CONTENT_UNAVAILABLE', 'Ce contenu n’est pas disponible.');
  let expires = nowSeconds + Math.min(Math.ceil(Number(asset.duration_seconds)) + 900, 18000);
  if (!preview) {
    const starts = Date.parse(subscription?.starts_at ?? '') / 1000;
    const ends = Date.parse(subscription?.expires_at ?? '') / 1000;
    if (subscription?.status !== 'active' || !['mobile', 'plus'].includes(subscription?.plan) ||
        !Number.isFinite(starts) || !Number.isFinite(ends) || starts > nowSeconds || ends <= nowSeconds) {
      throw new HttpError(403, 'SUBSCRIPTION_REQUIRED', 'Un abonnement actif est nécessaire pour ce film.');
    }
    if (!['mobile', 'plus'].includes(content.tier) || (content.tier === 'plus' && subscription.plan !== 'plus')) {
      throw new HttpError(403, 'PLAN_REQUIRED', 'Ce contenu nécessite l’abonnement Plus.');
    }
    expires = Math.min(expires, Math.floor(ends));
  }
  if (!Number.isFinite(expires) || expires <= nowSeconds) throw new HttpError(403, 'SUBSCRIPTION_REQUIRED', 'Votre abonnement a expiré.');
  return expires;
}

export function buildAlerts(events, nowMilliseconds = Date.now()) {
  const groups = new Map();
  const failures = [];
  for (const event of events) {
    if (event.source !== 'server') continue;
    const age = nowMilliseconds - Date.parse(event.created_at);
    if (!Number.isFinite(age) || age < 0 || age > 86400000) continue;
    if (event.kind === 'admin_access_denied' && age <= 900000 && event.user_id) {
      groups.set(event.user_id, (groups.get(event.user_id) ?? 0) + 1);
    }
    if (event.kind === 'video_processing_failed') failures.push(event);
  }
  const alerts = [];
  const repeated = [...groups.values()].filter((count) => count >= 5).reduce((total, count) => total + count, 0);
  if (repeated) alerts.push({ kind: 'repeated_admin_denials', severity: 'warning', title: 'Accès administrateur refusés à répétition — à vérifier', count: repeated, windowMinutes: 15 });
  if (failures.length) alerts.push({ kind: 'video_processing_failed', severity: 'warning', title: 'Échec de préparation de vidéo — à vérifier', count: failures.length, windowMinutes: 1440 });
  return alerts;
}
