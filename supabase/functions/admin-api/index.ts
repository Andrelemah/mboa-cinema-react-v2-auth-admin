import { apiHandler, authenticate, requireStaff, rateLimit, audit, databaseError, streamConfig, streamFetch, streamJson, applyStreamState, type Context } from '../_shared/runtime.ts';
import { HttpError, requireUuid, validateUpload, validateUploadLocation, VIDEO_UID_RE, base64Utf8, streamState, buildAlerts } from '../_shared/security.mjs';

async function recentEvents(context: Context) {
  const result = await context.service.from('security_events').select('id,created_at,user_id,kind,severity,source,details')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString()).order('created_at', { ascending: false }).limit(500);
  if (result.error) databaseError(result.error);
  return result.data ?? [];
}

async function createUpload(body: Record<string, unknown>, context: Context) {
  const params = validateUpload(body, Number(Deno.env.get('MAX_VIDEO_BYTES') ?? 10 * 1024 ** 3));
  streamConfig(); // Missing provider configuration cannot leave a reserved upload behind.
  await rateLimit(context, 'create-upload', 4, 3600);
  const reservation = await context.service.rpc('reserve_video_upload', { p_content_id: params.contentId, p_actor: context.user.id });
  if (reservation.error) databaseError(reservation.error, 'UPLOAD_CONFLICT');
  const attempt = reservation.data;
  let videoId: string | null = null;
  try {
    const expiry = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const response = await streamFetch('?direct_user=true', { method: 'POST', headers: {
      'Tus-Resumable': '1.0.0', 'Upload-Length': String(params.fileSize), 'Upload-Creator': context.user.id,
      'Upload-Metadata': `maxDurationSeconds ${base64Utf8(params.maxDurationSeconds)},requiresignedurls,expiry ${base64Utf8(expiry)},name ${base64Utf8(params.fileName)},filetype ${base64Utf8(params.fileType)}`,
    } });
    const rawId = response.headers.get('stream-media-id');
    if (!rawId || !VIDEO_UID_RE.test(rawId)) throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Identifiant vidéo absent. Réessayez.');
    videoId = rawId;
    const uploadUrl = validateUploadLocation(response.headers.get('Location'));
    const registration = await context.service.from('video_assets').update({ provider_uid: videoId, status: 'uploading', updated_at: new Date().toISOString() })
      .eq('content_id', params.contentId).eq('upload_attempt', attempt).eq('status', 'pending').select('content_id').single();
    if (registration.error || !registration.data) throw new HttpError(503, 'BACKEND_UNAVAILABLE', 'Le transfert n’a pas pu être enregistré.');
    await audit(context, 'video_upload_created', 'info', { contentId: params.contentId });
    return { uploadUrl, videoId };
  } catch (error) {
    // Cleanup is limited to a newly-created, never-delivered upload from this attempt.
    if (videoId) {
      try { await streamFetch(`/${videoId}`, { method: 'DELETE' }); } catch { await audit(context, 'video_upload_cleanup_failed', 'warning', { contentId: params.contentId }); }
    }
    await context.service.from('video_assets').update({ status: 'error', error_message: 'upload_initialization_failed', updated_at: new Date().toISOString() })
      .eq('content_id', params.contentId).eq('upload_attempt', attempt).neq('status', 'ready');
    throw error;
  }
}

Deno.serve(apiHandler(async (body, request) => {
  const context = await authenticate(request);
  await rateLimit(context, 'admin-api', 60, 60);
  await requireStaff(context);
  const action = body.action;
  if (['dashboard', 'users', 'security'].includes(String(action))) await requireStaff(context, true);

  if (action === 'dashboard') {
    const [dashboard, events] = await Promise.all([context.client.rpc('admin_dashboard'), recentEvents(context)]);
    if (dashboard.error) databaseError(dashboard.error);
    return { ...dashboard.data, alerts: buildAlerts(events) };
  }
  if (action === 'security') {
    const events = await recentEvents(context);
    return { events: events.slice(0, 200), alerts: buildAlerts(events) };
  }
  if (action === 'users') {
    const page = body.page ?? 1;
    const perPage = body.perPage ?? 50;
    if (!Number.isInteger(page) || Number(page) < 1 || Number(page) > 10000 || !Number.isInteger(perPage) || Number(perPage) < 1 || Number(perPage) > 100) throw new HttpError(400, 'INVALID_INPUT', 'Pagination invalide.');
    const authUsers = await context.service.auth.admin.listUsers({ page: Number(page), perPage: Number(perPage) });
    if (authUsers.error) databaseError(authUsers.error);
    const ids = authUsers.data.users.map((user) => user.id);
    if (!ids.length) return { users: [], page, perPage, hasMore: false };
    const [profiles, roles, activity] = await Promise.all([
      context.service.from('profiles').select('id,display_name,last_seen_at').in('id', ids),
      context.service.from('user_roles').select('user_id,role').in('user_id', ids),
      context.client.rpc('admin_user_activity', { p_user_ids: ids }),
    ]);
    for (const result of [profiles, roles, activity]) if (result.error) databaseError(result.error);
    const users = authUsers.data.users.map((user) => {
      const profile = profiles.data?.find((row) => row.id === user.id);
      return { id: user.id, email: user.email ?? null, phone: user.phone ?? null, display_name: profile?.display_name ?? '', role: roles.data?.find((row) => row.user_id === user.id)?.role ?? 'member',
        created_at: user.created_at, last_sign_in_at: user.last_sign_in_at ?? null, last_seen_at: profile?.last_seen_at ?? null,
        activity_seconds: Number(activity.data?.find((row: { user_id: string }) => row.user_id === user.id)?.activity_seconds ?? 0) };
    });
    return { users, page, perPage, hasMore: Boolean(authUsers.data.nextPage) };
  }
  if (action === 'create-upload') return createUpload(body, context);
  if (action === 'refresh-video') {
    const contentId = requireUuid(body.contentId);
    const result = await context.service.from('video_assets').select('provider_uid').eq('content_id', contentId).maybeSingle();
    if (result.error) databaseError(result.error);
    if (!VIDEO_UID_RE.test(result.data?.provider_uid ?? '')) throw new HttpError(409, 'VIDEO_NOT_READY', 'Aucune vidéo n’est encore enregistrée.');
    const video = await streamJson(`/${result.data!.provider_uid}`);
    return { asset: await applyStreamState(context.service, streamState(video)) };
  }
  if (action === 'publish' || action === 'archive') {
    const contentId = requireUuid(body.contentId);
    const result = await context.client.rpc(action === 'publish' ? 'publish_content' : 'archive_content', { p_content_id: contentId });
    if (result.error) databaseError(result.error, action === 'publish' ? 'PUBLICATION_NOT_READY' : 'INVALID_STATE');
    return { content: Array.isArray(result.data) ? result.data[0] : result.data };
  }
  throw new HttpError(400, 'INVALID_INPUT', 'Action inconnue.');
}));
