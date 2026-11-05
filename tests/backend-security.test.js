import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { allowedOrigin, configuredOrigins, isStaff, requireStaffRole, validateUpload, validateUploadLocation, verifyWebhookSignature, verifyPaystackSignature, streamState, playbackExpiry, buildAlerts } from '../supabase/functions/_shared/security.mjs';

const contentId = '10000000-0000-4000-8000-000000000001';
const uid = 'a'.repeat(32);
const now = 1800000000;
const subscription = { plan: 'mobile', status: 'active', starts_at: new Date((now - 100) * 1000).toISOString(), expires_at: new Date((now + 10000) * 1000).toISOString() };
const playback = { content: { status: 'published', tier: 'mobile' }, asset: { status: 'ready', provider_uid: uid, duration_seconds: 3600 }, subscription, role: 'member', claims: { aal: 'aal1' }, nowSeconds: now };

test('CORS uses exact configured origins and fails closed on invalid configuration', () => {
  const origins = configuredOrigins('https://mboa.example,http://localhost:5173');
  assert.equal(allowedOrigin('https://mboa.example', origins), true);
  assert.equal(allowedOrigin('https://mboa.example.attacker.invalid', origins), false);
  assert.equal(allowedOrigin('null', origins), false);
  assert.equal(allowedOrigin(null, origins), true);
  for (const value of ['', '*', 'http://mboa.example', 'https://mboa.example/', 'https://name:pass@mboa.example']) assert.throws(() => configuredOrigins(value));
});

test('Staff privileges require both stored staff role and verified AAL2', () => {
  assert.equal(isStaff('admin', { aal: 'aal2' }), true);
  assert.equal(isStaff('editor', { aal: 'aal2' }), true);
  assert.equal(isStaff('member', { aal: 'aal2' }), false);
  assert.equal(isStaff('admin', { aal: 'aal1' }), false);
  assert.throws(() => requireStaffRole('admin', { aal: 'aal1' }), { code: 'MFA_REQUIRED' });
  assert.throws(() => requireStaffRole('editor', { aal: 'aal2' }, true), { code: 'FORBIDDEN' });
});

test('Upload limits bound duration, file size, names, MIME and returned upload host', () => {
  const input = { contentId, fileSize: 1048576, fileName: 'Un été.mp4', fileType: 'video/mp4', maxDurationSeconds: 14400 };
  assert.equal(validateUpload(input).maxDurationSeconds, 14400);
  for (const bad of [{ fileSize: 0 }, { fileSize: 11 * 1024 ** 3 }, { maxDurationSeconds: 14401 }, { fileType: 'image/svg+xml' }, { fileName: '../video.mp4' }, { fileName: 'video\r\nX-header.mp4' }, { contentId: 'not-an-id' }]) assert.throws(() => validateUpload({ ...input, ...bad }), { code: 'INVALID_INPUT' });
  assert.equal(validateUploadLocation('https://upload.videodelivery.net/token'), 'https://upload.videodelivery.net/token');
  assert.throws(() => validateUploadLocation('https://upload.videodelivery.net.evil.invalid/token'));
  assert.throws(() => validateUploadLocation('http://upload.videodelivery.net/token'));
  assert.throws(() => validateUploadLocation('https://secret@upload.videodelivery.net/token'));
});

test('Stream webhook authenticates raw bytes and rejects stale, future, duplicated or tampered signatures', async () => {
  const secret = 'testing-only-webhook-secret-32-bytes';
  const raw = '{"uid":"a","state":"ready"}';
  const signature = createHmac('sha256', secret).update(`${now}.${raw}`).digest('hex');
  const header = `time=${now},sig1=${signature}`;
  assert.equal(await verifyWebhookSignature(raw, header, secret, now), true);
  assert.equal(await verifyWebhookSignature(raw + ' ', header, secret, now), false);
  assert.equal(await verifyWebhookSignature(raw, header, 'wrong-secret-long-enough', now), false);
  assert.equal(await verifyWebhookSignature(raw, header, secret, now + 301), false);
  assert.equal(await verifyWebhookSignature(raw, header, secret, now - 61), false);
  assert.equal(await verifyWebhookSignature(raw, `${header},time=${now}`, secret, now), false);
  assert.equal(await verifyWebhookSignature(raw, header, '', now), false);
});

test('Paystack verifies the exact raw body with HMAC-SHA512', async () => {
  const secret = 'testing-only-paystack-secret-32-bytes';
  const raw = '{"event":"charge.success","data":{"reference":"epizo-test-123"}}';
  const signature = createHmac('sha512', secret).update(raw).digest('hex');
  assert.equal(await verifyPaystackSignature(raw, signature, secret), true);
  assert.equal(await verifyPaystackSignature(raw + ' ', signature, secret), false);
  assert.equal(await verifyPaystackSignature(raw, signature.toUpperCase(), secret), true);
  assert.equal(await verifyPaystackSignature(raw, signature, 'wrong-secret-long-enough'), false);
  assert.equal(await verifyPaystackSignature(raw, 'short', secret), false);
  assert.equal(await verifyPaystackSignature(raw, signature, ''), false);
});

test('Ready videos require signed playback, verified provider state and a positive duration', () => {
  const video = { uid, modified: new Date(now * 1000).toISOString(), readyToStream: true, requireSignedURLs: true, status: { state: 'ready' }, duration: 125.5 };
  assert.equal(streamState(video).p_status, 'ready');
  assert.equal(streamState({ ...video, requireSignedURLs: false }).p_error, 'signed_playback_required');
  assert.equal(streamState({ ...video, duration: 0 }).p_status, 'processing');
  assert.equal(streamState({ ...video, readyToStream: false }).p_status, 'processing');
  assert.throws(() => streamState({ ...video, modified: 'bad' }));
});

test('Playback enforces active server subscription, content tier and staff MFA preview', () => {
  assert.equal(playbackExpiry(playback), now + 4500);
  assert.throws(() => playbackExpiry({ ...playback, subscription: null }), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.throws(() => playbackExpiry({ ...playback, subscription: { ...subscription, status: 'inactive' } }), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.throws(() => playbackExpiry({ ...playback, content: { status: 'published', tier: 'plus' } }), { code: 'PLAN_REQUIRED' });
  assert.throws(() => playbackExpiry({ ...playback, content: { status: 'draft', tier: 'mobile' } }), { code: 'CONTENT_UNAVAILABLE' });
  assert.throws(() => playbackExpiry({ ...playback, role: 'admin', subscription: null }), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.equal(playbackExpiry({ ...playback, role: 'editor', claims: { aal: 'aal2' }, subscription: null, content: { status: 'draft', tier: 'plus' } }), now + 4500);
});

test('Playback bearer validity is capped by video duration, five hours and entitlement expiry', () => {
  assert.equal(playbackExpiry({ ...playback, subscription: { ...subscription, expires_at: new Date((now + 120) * 1000).toISOString() } }), now + 120);
  assert.equal(playbackExpiry({ ...playback, asset: { ...playback.asset, duration_seconds: 86400 }, role: 'admin', claims: { aal: 'aal2' } }), now + 18000);
  assert.throws(() => playbackExpiry({ ...playback, subscription: { ...subscription, expires_at: new Date(now * 1000).toISOString() } }), { code: 'SUBSCRIPTION_REQUIRED' });
  assert.throws(() => playbackExpiry({ ...playback, subscription: { ...subscription, starts_at: new Date((now + 60) * 1000).toISOString() } }), { code: 'SUBSCRIPTION_REQUIRED' });
});

test('Security alerts require repeated server denials and never treat client diagnostics as intrusion proof', () => {
  const event = { user_id: contentId, source: 'server', kind: 'admin_access_denied', created_at: new Date(now * 1000).toISOString() };
  assert.equal(buildAlerts(Array(4).fill(event), now * 1000).length, 0);
  assert.equal(buildAlerts(Array(5).fill(event), now * 1000)[0].count, 5);
  assert.equal(buildAlerts(Array(50).fill({ ...event, source: 'client' }), now * 1000).length, 0);
  assert.equal(buildAlerts(Array(50).fill(event), (now + 901) * 1000).length, 0);
});
