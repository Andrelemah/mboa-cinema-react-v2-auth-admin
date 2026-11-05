import { apiHandler, authenticate, rateLimit, databaseError, audit } from '../_shared/runtime.ts';
import { HttpError, requireUuid, ROUTES, DIAGNOSTIC_COMPONENTS } from '../_shared/security.mjs';

Deno.serve(apiHandler(async (body, request) => {
  const context = await authenticate(request);
  await rateLimit(context, 'presence', 3, 60);
  const sessionId = requireUuid(body.sessionId);
  if (typeof body.route !== 'string' || !ROUTES.has(body.route)) throw new HttpError(400, 'INVALID_INPUT', 'Section invalide.');
  let component: string | null = null;
  if (body.diagnostic !== undefined) {
    const diagnostic = body.diagnostic as Record<string, unknown> | null;
    if (!diagnostic || diagnostic.code !== 'ui_error' || typeof diagnostic.component !== 'string' || !DIAGNOSTIC_COMPONENTS.has(diagnostic.component) || Object.keys(diagnostic).some((key) => !['code', 'component'].includes(key))) {
      throw new HttpError(400, 'INVALID_INPUT', 'Diagnostic invalide.');
    }
    component = diagnostic.component;
    await rateLimit(context, 'client-diagnostic', 5, 900);
  }
  const result = await context.service.rpc('record_presence', { p_user: context.user.id, p_session: sessionId, p_route: body.route });
  if (result.error) databaseError(result.error);
  if (component) await audit(context, 'client_ui_error', 'info', { code: 'ui_error', component }, 'client');
  return { ok: true, recordedAt: result.data };
}));
