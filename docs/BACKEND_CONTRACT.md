# Epizo backend contract

The React app uses one Supabase project for authentication, catalogue metadata, roles and activity. Cloudflare Stream receives video bytes directly; its account token remains inside Edge Functions.

## Frontend tables

- `content_items`: `id` UUID; `slug`, `title`, `synopsis`, `synopsis_en`, `genre`, `language_code`, `poster_path` text; `content_type` (`film` or `story`); `tier` (`mobile` or `plus`); `status` (`draft`, `published`, `archived`); `featured` boolean; `duration_seconds` number; `year` integer; `created_by` UUID; `created_at`, `updated_at`, `published_at` timestamps. `poster_path` is an object name in the public `posters` bucket, not an arbitrary external URL.
- `video_assets`: `content_id` UUID unique; `provider_uid` text private; `status` (`pending`, `uploading`, `processing`, `ready`, `error`); `duration_seconds`, `error_message`, `updated_at`. Authenticated staff at AAL2 can read. Only server code can write video readiness/UIDs.
- `profiles`: `id` UUID (Auth user ID), `display_name`, `created_at`, `last_seen_at`. Members read themselves and update only their display name. Admin AAL2 may read all. E-mail addresses and phone numbers remain in Supabase Auth, not duplicated in this table.
- `user_roles`: one row per Auth user, `user_id`, `role` (`member`, `editor`, `admin`). No client can insert/update/delete roles.
- `subscriptions`: server-managed `user_id`, `plan`, `status`, `starts_at`, `expires_at`. A member may read their own row; a simulated browser plan never grants video access.

`supabase.rpc('get_my_role')` returns `member`, `editor` or `admin` for the signed-in caller. A role alone is insufficient for staff operations: a verified JWT with `aal: 'aal2'` is also required.

Anonymous and member catalogue queries see **published content only**. Staff at AAL2 can additionally see drafts/archives and create/update draft metadata. To change published metadata, archive the item first. `status`, `published_at`, duration and ownership are server-controlled and cannot be forged by updating a table directly.

## Edge Functions

Use `supabase.functions.invoke(name, { body })`. Errors have `{error, code, requestId}`; HTTP 401 requires sign-in, 403 means insufficient role/MFA or access, 409 means an invalid workflow state, 429 means a rate limit.

### `admin-api`

| Body | Permission | Response |
| --- | --- | --- |
| `{action:'dashboard'}` | admin AAL2 | `{stats:{users,published,drafts,processing,activeToday,activitySecondsToday,securityWarnings24h}, activity:[{hour,seconds}], alerts:[]}` |
| `{action:'users', page:1, perPage:50}` | admin AAL2 | `{users:[{id,email,phone,display_name,role,created_at,last_sign_in_at,last_seen_at,activity_seconds}], page, perPage, hasMore}` |
| `{action:'security'}` | admin AAL2 | `{events:[{id,created_at,user_id,kind,severity,source,details}],alerts:[{kind,severity,title,count,windowMinutes}]}` |
| `{action:'create-upload',contentId,fileSize,fileName,fileType,maxDurationSeconds}` | staff AAL2 | `{uploadUrl,videoId}` — initialize `tus.Upload` with `uploadUrl` rather than an endpoint |
| `{action:'refresh-video',contentId}` | staff AAL2 | `{asset}` |
| `{action:'publish',contentId}` | staff AAL2 | `{content}` |
| `{action:'archive',contentId}` | staff AAL2 | `{content}` |

Staff = editor or admin. Content creation/update uses the ordinary client and RLS. Poster uploads use `supabase.storage.from('posters').upload(contentId + '/' + randomFileName, file, {upsert:false})`, with JPEG/PNG/WebP only and at most 8 MiB. Save the object name in `poster_path`. Object replacement/deletion is not exposed in the first version.

`activity_seconds` for each user is an aggregate over the last **30 days**, not lifetime viewing. Dashboard chart hours are UTC ISO timestamps; labels can use `Africa/Douala`. The daily totals use the day boundary in Douala. `security.events` returns the latest 200 events from the last 24 hours. Alert rules inspect the latest 500 server/client events in that same period, so a very busy log can omit older signals. The UI must not represent this sample as complete intrusion detection.

Draft inserts must omit `id`, `status`, `published_at`, `duration_seconds` and server timestamps. They may include `created_by` only with the current user's UUID. Metadata updates must also omit `created_by`. A ready video cannot be replaced in this version: create a new draft for a replacement. Upload URLs expire after six hours, and failed/expired attempts can be started again subject to the server rate limit. Default upload ceiling is 10 GiB, duration ceiling four hours. The API permits MP4, WebM, QuickTime, Matroska and AVI MIME declarations; the video provider validates actual media bytes.

Videos use TUS regardless of size, up to the server's configured limit. Upload completion does **not** publish the film. Server refresh or an authenticated Stream webhook must first establish `ready`; then the explicit publish operation validates required metadata, the poster object and the video.

### `activity-heartbeat`

Body `{sessionId: '<browser-generated UUID>', route:'accueil'|'films'|'histoires'|'ma-liste'|'abonnements'|'admin'|'connexion'|'compte'}`. Call at most once per minute while signed in and the document is visible. Response `{ok:true, recordedAt}`. Server timestamps and a per-user row lock cap elapsed time across tabs. Activity means observed presence in this platform, not proven viewing or an intrusion verdict.

An optional diagnostic body `{sessionId, route, diagnostic:{code:'ui_error',component:'Player'}}` records a rate-limited **untrusted client** signal. Do not send error stacks, URLs, tokens, passwords, e-mail input or arbitrary user content.

### `playback-token`

Body `{contentId}`. Response `{iframeUrl, expiresAt}`. Members need published ready content and an active server subscription covering its tier. AAL2 staff can preview draft ready videos. The iframe URL is a short-lived bearer URL: do not log or store it. This first implementation does not enforce phone attestation or concurrent playback leases; those remain a launch requirement.

`iframeUrl` uses `https://customer-<STREAM_CUSTOMER_CODE>.cloudflarestream.com/<signed-token>/iframe`. Token lifetime equals the verified video duration plus 15 minutes, capped at five hours, and capped at the member's subscription expiry. Revoking a subscription or archiving a film blocks **new** tokens; an already issued token can remain usable until its expiry. Pausing beyond that lifetime requires a new authorization. No download permission is requested. Signed playback is not DRM.

### `stream-webhook`

Cloudflare's configured webhook posts the raw payload with `Webhook-Signature`. Verification uses the server-only webhook secret, HMAC SHA-256 and a five-minute timestamp window. No browser key/JWT is accepted as a replacement. Replayed state updates are idempotent and an older notification cannot demote a newer ready asset.

## Safety boundaries

No Google/Apple credentials, service-role secret or Stream token belongs in any `VITE_` variable. No browser route or localStorage role grants staff access. Security alerts are explainable signals from actual server events, not an autonomous intrusion detector. Missing configuration produces a blocked/empty state rather than fabricated live users or successful uploads.

## Error codes and throttles

`AUTH_REQUIRED` (401); `FORBIDDEN`, `MFA_REQUIRED`, `ORIGIN_DENIED`, `SUBSCRIPTION_REQUIRED`, `PLAN_REQUIRED`, `CONTENT_UNAVAILABLE` (403, or 404 for missing staff content); `INVALID_INPUT` (400/413/415); `METHOD_NOT_ALLOWED` (405); `VIDEO_NOT_READY`, `UPLOAD_CONFLICT`, `PUBLICATION_NOT_READY`, `INVALID_STATE` (409); `RATE_LIMITED` (429); `NOT_CONFIGURED`, `BACKEND_UNAVAILABLE` (503); `PROVIDER_UNAVAILABLE` (502); `INTERNAL_ERROR` (500). The webhook additionally uses `INVALID_SIGNATURE` (401). Supabase gateway authentication failures may have their own envelope before the function runs; clients should always handle HTTP 401/403 even without this `code` field.

Per authenticated user: admin API 60 requests/minute; upload reservation four/hour; playback authorization 20/minute; presence three/minute; optional client diagnostics five/15 minutes. Counters are atomic database records, not in-memory function-instance limits. Infrastructure-level abusive traffic before valid authentication needs Auth/platform rate limits and monitoring.

## Configuration names

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_GOOGLE_ENABLED`, `VITE_AUTH_APPLE_ENABLED`.

Edge server: injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; configured `APP_ORIGIN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `STREAM_CUSTOMER_CODE`, `STREAM_WEBHOOK_SECRET`; optional `MAX_VIDEO_BYTES`.

`APP_ORIGIN` is a comma-separated list of exact browser origins. Non-browser requests without Origin are allowed through CORS checking but still require a valid user JWT and the appropriate role/MFA/entitlement. Origin is never treated as authentication. The webhook uses its HMAC, not this browser-origin mechanism.
