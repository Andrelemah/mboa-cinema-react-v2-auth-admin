import { apiHandler, authenticate, rateLimit, databaseError, streamJson, requiredEnv, audit } from '../_shared/runtime.ts';
import { HttpError, requireUuid, playbackExpiry } from '../_shared/security.mjs';

Deno.serve(apiHandler(async (body, request) => {
  const context = await authenticate(request);
  await rateLimit(context, 'playback', 20, 60);
  const contentId = requireUuid(body.contentId);
  const [content, asset, subscription] = await Promise.all([
    context.service.from('content_items').select('id,status,tier').eq('id', contentId).maybeSingle(),
    context.service.from('video_assets').select('status,provider_uid,duration_seconds').eq('content_id', contentId).maybeSingle(),
    context.service.from('subscriptions').select('plan,status,starts_at,expires_at').eq('user_id', context.user.id).maybeSingle(),
  ]);
  for (const result of [content, asset, subscription]) if (result.error) databaseError(result.error);
  let expires: number;
  try {
    expires = playbackExpiry({ content: content.data, asset: asset.data, subscription: subscription.data, role: context.role, claims: context.claims });
  } catch (error) {
    if (error instanceof HttpError) await audit(context, 'playback_denied', 'info', { contentId, reason: error.code });
    throw error;
  }
  const customer = requiredEnv('STREAM_CUSTOMER_CODE');
  if (!/^[a-z0-9-]+$/i.test(customer) || customer.length > 80) throw new HttpError(503, 'NOT_CONFIGURED', 'Le lecteur vidéo doit être configuré.');
  const result = await streamJson(`/${asset.data!.provider_uid}/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exp: expires, downloadable: false }) });
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.token)) throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le lecteur vidéo est momentanément indisponible.');
  return { iframeUrl: `https://customer-${customer}.cloudflarestream.com/${result.token}/iframe`, expiresAt: new Date(expires * 1000).toISOString() };
}));
