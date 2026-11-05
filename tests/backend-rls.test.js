import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL rules run in PGlite. Only the external Auth/Storage schemas
// are stubbed; every MBOA table, grant, policy, trigger and RPC uses the migration.
const ids = {
  member: '10000000-0000-4000-8000-000000000001', other: '10000000-0000-4000-8000-000000000002',
  editor: '10000000-0000-4000-8000-000000000003', admin: '10000000-0000-4000-8000-000000000004',
};
const videoUid = 'a'.repeat(32);

test('PostgreSQL role isolation and server-controlled publishing', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select on storage.buckets to anon,authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      grant all on storage.buckets,storage.objects to service_role;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202611020001_mboa_backend.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202611040001_epizo_payments.sql', import.meta.url), 'utf8'));
    for (const id of Object.values(ids)) await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"role\":\"admin\",\"display_name\":\"Test\"}')", [id]);
    await db.query("update public.user_roles set role='editor' where user_id=$1", [ids.editor]);
    await db.query("update public.user_roles set role='admin' where user_id=$1", [ids.admin]);

    async function asRole(role, userId, aal, sql, params = []) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role, aal })]);
        const result = await db.query(sql, params);
        await db.exec('commit');
        return result.rows;
      } catch (error) { await db.exec('rollback'); throw error; }
    }
    const member = (sql, params) => asRole('authenticated', ids.member, 'aal1', sql, params);
    const editor = (sql, params) => asRole('authenticated', ids.editor, 'aal2', sql, params);
    const admin = (sql, params) => asRole('authenticated', ids.admin, 'aal2', sql, params);
    const server = (sql, params) => asRole('service_role', null, null, sql, params);
    let contentId;

    await t.test('signup metadata cannot grant administrator privileges', async () => {
      assert.equal((await member('select public.get_my_role() role'))[0].role, 'member');
      assert.equal((await member('select count(*)::int count from public.profiles'))[0].count, 1);
      assert.equal((await member('select count(*)::int count from public.user_roles'))[0].count, 1);
      await assert.rejects(member("update public.user_roles set role='admin' where user_id=$1", [ids.member]));
      await assert.rejects(member("insert into public.subscriptions(user_id,plan,status,expires_at) values($1,'plus','active',now()+interval '1 year')", [ids.member]));
      await assert.rejects(member('select public.consume_rate_limit($1,10,60)', ['forged']));
      await assert.rejects(member('select public.record_presence($1,$2,$3)', [ids.other, ids.member, 'accueil']));
    });

    await t.test('only staff at AAL2 can create or access drafts', async () => {
      await assert.rejects(member("insert into public.content_items(slug,title) values('member-draft','No')"));
      await assert.rejects(asRole('authenticated', ids.admin, 'aal1', "insert into public.content_items(slug,title) values('admin-without-mfa','No')"));
      const result = await editor("insert into public.content_items(slug,title,synopsis,genre) values('film-test','Film test','Synopsis test','Drame') returning id");
      contentId = result[0].id;
      assert.equal((await member('select * from public.content_items')).length, 0);
      assert.equal((await asRole('anon', null, null, 'select * from public.content_items')).length, 0);
      assert.equal((await editor('select * from public.content_items')).length, 1);
      await assert.rejects(editor("update public.content_items set status='published' where id=$1", [contentId]));
      await assert.rejects(editor('update public.content_items set duration_seconds=3600 where id=$1', [contentId]));
      await assert.rejects(editor('update public.content_items set created_by=$1 where id=$2', [ids.admin, contentId]));
      await assert.rejects(editor("insert into public.content_items(slug,status) values('bypass-draft','published')"));
    });

    await t.test('video readiness and publication cannot be asserted by the browser', async () => {
      await assert.rejects(editor("insert into public.video_assets(content_id,provider_uid,status) values($1,$2,'ready')", [contentId, videoUid]));
      await assert.rejects(editor('select public.publish_content($1)', [contentId]));
      await assert.rejects(editor("select public.reserve_video_upload($1,$2)", [contentId, ids.editor]));
      const attempt = await server('select public.reserve_video_upload($1,$2) attempt', [contentId, ids.editor]);
      assert.ok(attempt[0].attempt);
      await assert.rejects(server('select public.reserve_video_upload($1,$2)', [contentId, ids.editor]));
      await server("update public.video_assets set provider_uid=$1,status='uploading' where content_id=$2", [videoUid, contentId]);
      assert.equal((await member('select * from public.video_assets')).length, 0);
      await assert.rejects(member("select public.apply_video_status($1,'ready',100,null,now())", [videoUid]));
      await server("select public.apply_video_status($1,'ready',120,null,'2026-11-02T10:00:00Z')", [videoUid]);
      await assert.rejects(editor('select public.publish_content($1)', [contentId]));
    });

    await t.test('poster paths require staff and draft ownership; publishing validates the stored object', async () => {
      const path = `${contentId}/poster.webp`;
      await assert.rejects(member("insert into storage.objects(bucket_id,name) values('posters',$1)", [path]));
      await assert.rejects(editor("insert into storage.objects(bucket_id,name) values('posters',$1)", [`${ids.member}/fake.webp`]));
      await editor("insert into storage.objects(bucket_id,name) values('posters',$1)", [path]);
      await editor('update public.content_items set poster_path=$1 where id=$2', [path, contentId]);
      await assert.rejects(member('select public.publish_content($1)', [contentId]));
      await assert.rejects(asRole('authenticated', ids.admin, 'aal1', 'select public.publish_content($1)', [contentId]));
      const published = await editor('select (public.publish_content($1)).status status', [contentId]);
      assert.equal(published[0].status, 'published');
      const catalogue = await asRole('anon', null, null, 'select * from public.content_items');
      assert.equal(catalogue.length, 1);
      assert.equal(catalogue[0].duration_seconds, '120');
      assert.equal('provider_uid' in catalogue[0], false);
      assert.equal((await editor("update public.content_items set title='Changed live' where id=$1 returning id", [contentId])).length, 0);
      assert.equal((await editor('delete from storage.objects where name=$1 returning id', [path])).length, 0);
    });

    await t.test('late and duplicate provider events cannot demote a ready video or rewrite duration', async () => {
      await server("select public.apply_video_status($1,'processing',0,null,'2026-11-02T09:00:00Z')", [videoUid]);
      await server("select public.apply_video_status($1,'processing',0,null,'2026-11-02T11:00:00Z')", [videoUid]);
      await server("select public.apply_video_status($1,'ready',999,null,'2026-11-02T10:00:00Z')", [videoUid]);
      const asset = (await editor('select * from public.video_assets'))[0];
      assert.equal(asset.status, 'ready');
      assert.equal(asset.duration_seconds, '120');
      await server("select public.apply_video_status($1,'error',0,'provider_processing_error','2026-11-02T12:00:00Z')", [videoUid]);
      assert.equal((await member('select * from public.content_items')).length, 0);
      assert.equal((await editor('select status from public.content_items'))[0].status, 'archived');
      await editor("update public.content_items set title='Archived editable' where id=$1", [contentId]);
    });

    await t.test('personal activity and the administration dashboard remain isolated', async () => {
      await assert.rejects(editor('select public.admin_dashboard()'));
      await assert.rejects(asRole('authenticated', ids.admin, 'aal1', 'select public.admin_dashboard()'));
      assert.equal((await editor('select * from public.security_events')).length, 0);
      assert.ok((await admin('select * from public.security_events')).length > 0);
      assert.equal((await admin('select public.admin_dashboard() value'))[0].value.stats.users, 4);
      const session = '20000000-0000-4000-8000-000000000001';
      await server('select public.record_presence($1,$2,$3)', [ids.member, session, 'accueil']);
      await db.query("update public.profiles set last_seen_at=now()-interval '5 minutes' where id=$1", [ids.member]);
      await server('select public.record_presence($1,$2,$3)', [ids.member, session, 'films']);
      await server('select public.record_presence($1,$2,$3)', [ids.member, '20000000-0000-4000-8000-000000000002', 'films']);
      const seconds = Number((await member('select sum(active_seconds) seconds from public.activity_hourly'))[0].seconds);
      assert.ok(seconds >= 75 && seconds <= 76, `Presence must cap elapsed time and avoid duplicate-tab counting: ${seconds}`);
      assert.equal((await asRole('authenticated', ids.other, 'aal1', 'select * from public.activity_hourly')).length, 0);
      await assert.rejects(server('select public.record_presence($1,$2,$3)', [ids.other, session, 'films']));
      assert.equal(Number((await admin('select * from public.admin_user_activity($1)', [[ids.member]]))[0].activity_seconds), seconds);
    });

    await t.test('rate-limit counters cannot be reset by members', async () => {
      assert.equal((await server("select public.consume_rate_limit('unit:test',2,60) ok"))[0].ok, true);
      assert.equal((await server("select public.consume_rate_limit('unit:test',2,60) ok"))[0].ok, true);
      assert.equal((await server("select public.consume_rate_limit('unit:test',2,60) ok"))[0].ok, false);
      await assert.rejects(member('delete from private.rate_limits'));
    });

    await t.test('payment transactions are private, server-managed, validated and idempotent', async () => {
      const reference = 'epizo-test-payment-001';
      await server(
        "insert into public.payment_transactions(user_id,reference,plan,amount_minor,currency,channels) values($1,$2,'mobile',3000,'XAF',array['card','mobile_money'])",
        [ids.member, reference],
      );
      assert.equal((await member('select reference from public.payment_transactions'))[0].reference, reference);
      assert.equal((await asRole('authenticated', ids.other, 'aal1', 'select * from public.payment_transactions')).length, 0);
      await assert.rejects(member("insert into public.payment_transactions(user_id,reference,plan,amount_minor,currency,channels) values($1,'epizo-forged-001','plus',5000,'XAF',array['card'])", [ids.member]));
      await assert.rejects(member("update public.payment_transactions set status='succeeded' where reference=$1", [reference]));
      await assert.rejects(member("select public.complete_paystack_transaction($1,3000,'XAF','provider-transaction-1','card')", [reference]));
      await assert.rejects(server("select public.complete_paystack_transaction($1,2999,'XAF','provider-transaction-1','card')", [reference]));
      await assert.rejects(server("select public.complete_paystack_transaction($1,3000,'XAF','provider-transaction-1',null)", [reference]));

      const completed = await server("select (public.complete_paystack_transaction($1,3000,'XAF','provider-transaction-1','card')).status status", [reference]);
      assert.equal(completed[0].status, 'succeeded');
      const expiry = (await server('select expires_at from public.subscriptions where user_id=$1', [ids.member]))[0].expires_at;
      await server("select public.complete_paystack_transaction($1,3000,'XAF','provider-transaction-1','card')", [reference]);
      assert.equal((await server('select expires_at from public.subscriptions where user_id=$1', [ids.member]))[0].expires_at.getTime(), expiry.getTime());
      await assert.rejects(server("select public.complete_paystack_transaction($1,3000,'XAF','provider-transaction-2','card')", [reference]));
    });

    await t.test('renewing an active plan preserves current access and extends expiry by 30 days', async () => {
      const before = (await server('select starts_at,expires_at from public.subscriptions where user_id=$1', [ids.member]))[0];
      const reference = 'epizo-test-renewal-001';
      await server(
        "insert into public.payment_transactions(user_id,reference,plan,amount_minor,currency,channels) values($1,$2,'mobile',3000,'XAF',array['card'])",
        [ids.member, reference],
      );
      await server("select public.complete_paystack_transaction($1,3000,'XAF','provider-renewal-1','card')", [reference]);
      const renewed = (await server('select starts_at,expires_at,starts_at<=now() and expires_at>now() as usable from public.subscriptions where user_id=$1', [ids.member]))[0];
      assert.equal(renewed.usable, true, 'Renewal must not suspend access until the old expiry date');
      assert.equal(renewed.starts_at.getTime(), before.starts_at.getTime());
      assert.equal(renewed.expires_at.getTime() - before.expires_at.getTime(), 30 * 24 * 60 * 60 * 1000);
    });
  } finally { await db.close(); }
});
