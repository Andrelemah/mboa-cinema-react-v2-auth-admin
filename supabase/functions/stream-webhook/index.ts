import { requiredEnv, serviceClient, readTextBounded, jsonResponse, failure, applyStreamState } from '../_shared/runtime.ts';
import { HttpError, verifyWebhookSignature, streamState } from '../_shared/security.mjs';

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    const raw = await readTextBounded(request, 1024 * 1024);
    const valid = await verifyWebhookSignature(raw, request.headers.get('Webhook-Signature'), requiredEnv('STREAM_WEBHOOK_SECRET'));
    if (!valid) throw new HttpError(401, 'INVALID_SIGNATURE', 'Signature invalide.');
    let video;
    try { video = JSON.parse(raw); } catch { throw new HttpError(400, 'INVALID_INPUT', 'Requête invalide.'); }
    // The database updates only previously registered provider UIDs; it never
    // creates catalogue entries from an external event's metadata or creator.
    const asset = await applyStreamState(serviceClient(), streamState(video));
    return jsonResponse({ ok: true, registered: Boolean(asset?.content_id) }, 200, { 'X-Request-ID': requestId });
  } catch (error) { return failure(error, requestId, { 'X-Request-ID': requestId }); }
});
