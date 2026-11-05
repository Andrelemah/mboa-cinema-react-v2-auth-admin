import { Upload } from 'tus-js-client';
import { backendConfigured, supabase } from '../lib/supabase.js';
import { safePlayerUrl } from '../utils/publishedContent.js';

export const POSTER_LIMIT = 8 * 1024 * 1024;
export const VIDEO_LIMIT = 10 * 1024 * 1024 * 1024;

export class AdminRequestError extends Error {
  constructor(message, code = 'request_failed', status = 0) {
    super(message);
    this.name = 'AdminRequestError';
    this.code = code;
    this.status = status;
  }
}

function requireClient() {
  if (!backendConfigured || !supabase) throw new AdminRequestError('Connectez le backend pour utiliser cette action.', 'configuration_required');
  return supabase;
}

function friendlyError(status, code) {
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous pour continuer.';
  if (status === 403) return 'Cette action nécessite un rôle autorisé et une double authentification valide.';
  if (status === 409) return 'Ce contenu ne peut pas être modifié à cette étape. Actualisez son état avant de continuer.';
  if (status === 429) return 'Trop de demandes rapprochées. Patientez un instant avant de réessayer.';
  if (code === 'configuration_required') return 'Un service nécessaire n’est pas encore configuré.';
  return 'L’opération n’a pas abouti. Vérifiez votre connexion puis réessayez.';
}

async function throwFunctionError(error, fallbackData) {
  let body = fallbackData;
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try { body = await response.clone().json(); } catch { /* A provider may return a non-JSON error. */ }
  }
  const status = response?.status || 0;
  const code = typeof body?.code === 'string' ? body.code : 'request_failed';
  throw new AdminRequestError(friendlyError(status, code), code, status);
}

export async function adminAction(action, payload = {}) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke('admin-api', { body: { action, ...payload } });
  if (error || data?.error) await throwFunctionError(error, data);
  return data;
}

export async function listContents({ page = 1, pageSize = 15, query = '', status = 'all' } = {}) {
  const client = requireClient();
  let request = client.from('content_items')
    .select('*, video_assets(status,duration_seconds,error_message,updated_at)', { count: 'exact' })
    .order('updated_at', { ascending: false });
  if (status !== 'all') request = request.eq('status', status);
  if (query.trim()) request = request.ilike('title', `%${query.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
  const { data, error, count } = await request.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new AdminRequestError(friendlyError(error.code === '42501' ? 403 : 0, error.code), error.code);
  return {
    items: (data || []).map(item => ({ ...item, asset: Array.isArray(item.video_assets) ? item.video_assets[0] || null : item.video_assets || null })),
    total: count || 0, page, pageSize, hasMore: page * pageSize < (count || 0),
  };
}

export function makeSlug(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-+$/g, '');
  return text.length >= 3 ? text : text ? `film-${text}` : `film-${crypto.randomUUID().slice(0, 8)}`;
}

function draftFields(values) {
  return {
    title: String(values.title || '').trim().slice(0, 180),
    slug: makeSlug(values.slug || values.title),
    synopsis: String(values.synopsis || '').trim().slice(0, 4000),
    synopsis_en: String(values.synopsis_en || '').trim().slice(0, 4000),
    content_type: values.content_type === 'story' ? 'story' : 'film',
    genre: String(values.genre || '').trim().slice(0, 60),
    language_code: String(values.language_code || 'fr'),
    tier: values.tier === 'plus' ? 'plus' : 'mobile',
    featured: Boolean(values.featured),
    year: Number(values.year),
  };
}

export async function saveDraft(values, existingId, userId) {
  const client = requireClient();
  const payload = draftFields(values);
  const request = existingId
    ? client.from('content_items').update(payload).eq('id', existingId)
    : client.from('content_items').insert({ ...payload, created_by: userId });
  const { data, error } = await request.select().single();
  if (error) {
    const message = error.code === '23505'
      ? 'Ce lien de contenu existe déjà. Choisissez un autre identifiant.'
      : friendlyError(error.code === '42501' ? 403 : 0, error.code);
    throw new AdminRequestError(message, error.code);
  }
  return data;
}

export function posterUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from('posters').getPublicUrl(path).data.publicUrl;
}

export async function uploadPoster(contentId, file) {
  const client = requireClient();
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!extensions[file.type]) throw new AdminRequestError('Choisissez une affiche JPG, PNG ou WebP.');
  if (file.size > POSTER_LIMIT) throw new AdminRequestError('L’affiche doit peser au maximum 8 Mo.');
  const path = `${contentId}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error: uploadError } = await client.storage.from('posters').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new AdminRequestError('L’affiche n’a pas pu être chargée. Vérifiez votre session et réessayez.');
  const { data, error } = await client.from('content_items').update({ poster_path: path }).eq('id', contentId).select().single();
  if (error) throw new AdminRequestError('L’affiche a été reçue, mais son association au contenu a échoué. Réessayez depuis ce brouillon.');
  return data;
}

export async function createVideoUpload(contentId, file, maxDurationSeconds, callbacks) {
  const types = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
  const fileType = file.type || types[file.name.split('.').pop().toLowerCase()];
  if (!fileType?.startsWith('video/')) throw new AdminRequestError('Choisissez un fichier vidéo MP4, MOV ou WebM.');
  if (file.size <= 0 || file.size > VIDEO_LIMIT) throw new AdminRequestError('Choisissez une vidéo non vide de moins de 10 Go.');
  const { uploadUrl } = await adminAction('create-upload', { contentId, fileSize: file.size, fileName: file.name, fileType, maxDurationSeconds: Number(maxDurationSeconds) });
  if (!uploadUrl || new URL(uploadUrl).protocol !== 'https:') throw new AdminRequestError('Le lien de chargement n’a pas pu être créé.');
  // The capability URL stays in memory. Retry and pause/resume work while this
  // editor is open; no upload bearer URL is persisted in localStorage.
  return new Upload(file, {
    uploadUrl,
    chunkSize: 50 * 1024 * 1024,
    retryDelays: [0, 1000, 3000, 5000, 10000],
    storeFingerprintForResuming: false,
    removeFingerprintOnSuccess: true,
    metadata: { filename: file.name, filetype: fileType },
    onProgress: callbacks.onProgress,
    onSuccess: callbacks.onSuccess,
    onError: callbacks.onError,
  });
}

export async function previewVideo(contentId) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke('playback-token', { body: { contentId } });
  if (error || data?.error) await throwFunctionError(error, data);
  const iframeUrl = safePlayerUrl(data?.iframeUrl);
  if (!iframeUrl) throw new AdminRequestError('L’aperçu vidéo n’est pas disponible.');
  return { ...data, iframeUrl };
}

export function refreshPublicCatalogue() {
  window.dispatchEvent(new CustomEvent('mboa:catalogue-refresh'));
}
