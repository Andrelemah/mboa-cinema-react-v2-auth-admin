-- MBOA: authentication-backed catalogue, staff permissions and operational signals.
-- Run through Supabase migrations. No account is promoted from signup metadata.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','editor','admin'))
);
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('mobile','plus')),
  status text not null default 'inactive' check (status in ('inactive','active','cancelled','expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 120),
  title text not null default '' check (char_length(title) <= 180),
  synopsis text not null default '' check (char_length(synopsis) <= 4000),
  synopsis_en text not null default '' check (char_length(synopsis_en) <= 4000),
  content_type text not null default 'film' check (content_type in ('film','story')),
  genre text not null default '' check (char_length(genre) <= 60),
  language_code text not null default 'fr' check (language_code in ('fr','en','bas','dua','fub','ewo','und-bamileke')),
  tier text not null default 'mobile' check (tier in ('mobile','plus')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  poster_path text check (poster_path is null or (poster_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' and split_part(poster_path,'/',1)=id::text)),
  featured boolean not null default false,
  duration_seconds numeric not null default 0 check (duration_seconds >= 0 and duration_seconds <= 86400),
  year integer not null default extract(year from now()) check (year between 1900 and 2100),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table public.video_assets (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  provider_uid text unique check (provider_uid is null or provider_uid ~ '^[a-f0-9]{32}$'),
  status text not null default 'pending' check (status in ('pending','uploading','processing','ready','error')),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  error_message text check (char_length(error_message) <= 500),
  uploaded_by uuid references auth.users(id),
  upload_attempt uuid not null default gen_random_uuid(),
  provider_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.activity_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table public.activity_hourly (
  user_id uuid not null references auth.users(id) on delete cascade,
  hour timestamptz not null,
  active_seconds integer not null default 0 check (active_seconds between 0 and 3600),
  primary key (user_id,hour)
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (char_length(kind) between 1 and 80),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source text not null default 'server' check (source in ('server','client')),
  details jsonb not null default '{}' check (octet_length(details::text) <= 4096)
);
create table private.rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hits integer not null
);
create index content_items_published_idx on public.content_items(status,published_at desc);
create index activity_sessions_user_idx on public.activity_sessions(user_id,last_seen_at desc);
create index activity_hourly_time_idx on public.activity_hourly(hour);
create index security_events_time_idx on public.security_events(created_at desc);
create index security_events_user_kind_idx on public.security_events(user_id,kind,created_at desc);

create function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('editor','admin'));
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin');
$$;
create function public.get_my_role() returns text language sql stable security definer set search_path='' as $$
  select coalesce((select role from public.user_roles where user_id=auth.uid()),'member');
$$;
revoke all on function private.is_staff(), private.is_admin(), public.get_my_role() from public;
grant execute on function private.is_staff(), private.is_admin() to anon,authenticated,service_role;
grant execute on function public.get_my_role() to authenticated;

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',''),80));
  insert into public.user_roles(user_id,role) values(new.id,'member');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger mboa_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
insert into public.profiles(id,display_name) select id,left(coalesce(raw_user_meta_data->>'display_name',raw_user_meta_data->>'full_name',''),80) from auth.users on conflict(id) do nothing;
insert into public.user_roles(user_id,role) select id,'member' from auth.users on conflict(user_id) do nothing;

create function private.touch_content() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' and (new.status <> 'draft' or new.published_at is not null or new.duration_seconds<>0 or new.created_by<>auth.uid()) then
      raise exception 'Draft ownership and lifecycle are server controlled' using errcode='42501';
    end if;
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function private.touch_content() from public;
create trigger mboa_content_touch before insert or update on public.content_items for each row execute function private.touch_content();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.content_items enable row level security;
alter table public.video_assets enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.activity_hourly enable row level security;
alter table public.security_events enable row level security;
alter table private.rate_limits enable row level security;
revoke all on public.profiles,public.user_roles,public.subscriptions,public.content_items,public.video_assets,public.activity_sessions,public.activity_hourly,public.security_events from public,anon,authenticated;
revoke all on private.rate_limits from public,anon,authenticated;
grant all on public.profiles,public.user_roles,public.subscriptions,public.content_items,public.video_assets,public.activity_sessions,public.activity_hourly,public.security_events,private.rate_limits to service_role;
grant select on public.content_items to anon,authenticated;
grant insert(slug,title,synopsis,synopsis_en,content_type,genre,language_code,tier,poster_path,featured,year,created_by) on public.content_items to authenticated;
grant update(slug,title,synopsis,synopsis_en,content_type,genre,language_code,tier,poster_path,featured,year) on public.content_items to authenticated;
grant select on public.profiles,public.user_roles,public.subscriptions,public.video_assets,public.activity_sessions,public.activity_hourly,public.security_events to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy content_read on public.content_items for select to anon,authenticated using (status='published' or private.is_staff());
create policy content_insert on public.content_items for insert to authenticated with check(private.is_staff() and created_by=auth.uid() and status='draft');
create policy content_update on public.content_items for update to authenticated using(private.is_staff() and status in ('draft','archived')) with check(private.is_staff() and status in ('draft','archived'));
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy role_read on public.user_roles for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy subscription_read on public.subscriptions for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy asset_read on public.video_assets for select to authenticated using(private.is_staff());
create policy session_read on public.activity_sessions for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy activity_read on public.activity_hourly for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy security_read on public.security_events for select to authenticated using(private.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('posters','posters',true,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Never turn an existing unrelated private bucket public as a migration side effect.
do $$ begin
  if not exists(select 1 from storage.buckets where id='posters' and public=true and file_size_limit=8388608 and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
    raise exception 'The existing posters bucket does not match the expected public image bucket. Review it before migrating.';
  end if;
end $$;
create policy mboa_poster_insert on storage.objects for insert to authenticated with check(
  bucket_id='posters' and private.is_staff()
  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
  and exists(select 1 from public.content_items c where c.id::text=split_part(name,'/',1) and c.status in ('draft','archived'))
);
create policy mboa_poster_staff_read on storage.objects for select to authenticated using(bucket_id='posters' and private.is_staff());

create function public.publish_content(p_content_id uuid) returns public.content_items language plpgsql security definer set search_path='' as $$
declare item public.content_items; asset public.video_assets;
begin
  if not private.is_staff() then raise exception 'Staff MFA required' using errcode='42501'; end if;
  select * into item from public.content_items where id=p_content_id for update;
  if not found then raise exception 'Content not found' using errcode='P0002'; end if;
  select * into asset from public.video_assets where content_id=p_content_id for update;
  if asset.status is distinct from 'ready' or asset.provider_uid is null or asset.duration_seconds<=0 then raise exception 'Video not ready' using errcode='P0001'; end if;
  if char_length(trim(item.title))=0 or char_length(trim(item.synopsis))=0 or char_length(trim(item.genre))=0 or item.poster_path is null then raise exception 'Required metadata missing' using errcode='P0001'; end if;
  if not exists(select 1 from storage.objects where bucket_id='posters' and name=item.poster_path) then raise exception 'Poster missing' using errcode='P0001'; end if;
  update public.content_items set status='published',published_at=now(),duration_seconds=asset.duration_seconds where id=p_content_id returning * into item;
  insert into public.security_events(user_id,kind,details) values(auth.uid(),'content_published',jsonb_build_object('contentId',p_content_id));
  return item;
end;
$$;
create function public.archive_content(p_content_id uuid) returns public.content_items language plpgsql security definer set search_path='' as $$
declare item public.content_items;
begin
  if not private.is_staff() then raise exception 'Staff MFA required' using errcode='42501'; end if;
  update public.content_items set status='archived' where id=p_content_id returning * into item;
  if not found then raise exception 'Content not found' using errcode='P0002'; end if;
  insert into public.security_events(user_id,kind,details) values(auth.uid(),'content_archived',jsonb_build_object('contentId',p_content_id));
  return item;
end;
$$;
revoke all on function public.publish_content(uuid),public.archive_content(uuid) from public;
grant execute on function public.publish_content(uuid),public.archive_content(uuid) to authenticated;

create function public.reserve_video_upload(p_content_id uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.content_items; asset public.video_assets; attempt uuid=gen_random_uuid();
begin
  if not exists(select 1 from public.user_roles where user_id=p_actor and role in ('editor','admin')) then raise exception 'Staff required' using errcode='42501'; end if;
  select * into item from public.content_items where id=p_content_id for update;
  if not found or item.status='published' then raise exception 'Draft or archived content required' using errcode='P0001'; end if;
  select * into asset from public.video_assets where content_id=p_content_id for update;
  if found and (asset.status='ready' or (asset.status in ('pending','uploading','processing') and asset.updated_at>now()-interval '6 hours')) then raise exception 'Video already exists or upload is in progress' using errcode='P0001'; end if;
  insert into public.video_assets(content_id,status,uploaded_by,upload_attempt) values(p_content_id,'pending',p_actor,attempt)
  on conflict(content_id) do update set status='pending',provider_uid=null,uploaded_by=p_actor,upload_attempt=attempt,error_message=null,provider_modified_at=null,duration_seconds=0,updated_at=now();
  return attempt;
end;
$$;

create function public.apply_video_status(p_provider_uid text,p_status text,p_duration numeric,p_error text,p_modified timestamptz) returns public.video_assets language plpgsql security definer set search_path='' as $$
declare asset public.video_assets;
begin
  if p_status not in ('uploading','processing','ready','error') or p_modified is null then raise exception 'Invalid video state'; end if;
  -- Use the same lock order as publishing/reserving: content first, asset second.
  -- This avoids a webhook/publication deadlock at the moment encoding completes.
  select * into asset from public.video_assets where provider_uid=p_provider_uid;
  if not found then return null; end if;
  perform 1 from public.content_items where id=asset.content_id for update;
  select * into asset from public.video_assets where provider_uid=p_provider_uid for update;
  if not found then return null; end if;
  if asset.provider_modified_at is not null and p_modified<=asset.provider_modified_at then return asset; end if;
  if asset.status='ready' and p_status in ('uploading','processing') then return asset; end if;
  if p_status='ready' and (p_duration is null or p_duration<=0 or p_duration>86400) then raise exception 'Invalid ready duration'; end if;
  update public.video_assets set status=p_status,duration_seconds=coalesce(p_duration,0),error_message=left(p_error,500),provider_modified_at=p_modified,updated_at=now() where content_id=asset.content_id returning * into asset;
  if p_status='ready' then update public.content_items set duration_seconds=asset.duration_seconds where id=asset.content_id; end if;
  if p_status='error' then
    update public.content_items set status='archived' where id=asset.content_id and status='published';
    insert into public.security_events(user_id,kind,severity,details) values(asset.uploaded_by,'video_processing_failed','warning',jsonb_build_object('contentId',asset.content_id,'reason',left(coalesce(p_error,'processing_error'),120)));
  end if;
  return asset;
end;
$$;

create function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare result integer;
begin
  if char_length(p_key)>200 or p_limit<1 or p_window_seconds<1 then raise exception 'Invalid rate configuration'; end if;
  insert into private.rate_limits(key,window_started_at,hits) values(p_key,now(),1)
  on conflict(key) do update set hits=case when private.rate_limits.window_started_at<=now()-make_interval(secs=>p_window_seconds) then 1 else private.rate_limits.hits+1 end,
    window_started_at=case when private.rate_limits.window_started_at<=now()-make_interval(secs=>p_window_seconds) then now() else private.rate_limits.window_started_at end
  returning hits into result;
  return result<=p_limit;
end;
$$;

create function public.record_presence(p_user uuid,p_session uuid,p_route text) returns timestamptz language plpgsql security definer set search_path='' as $$
declare previous_seen timestamptz; stamp timestamptz; elapsed integer;
begin
  if p_route not in ('accueil','films','histoires','ma-liste','abonnements','admin','connexion','compte') then raise exception 'Invalid route'; end if;
  select last_seen_at into previous_seen from public.profiles where id=p_user for update;
  if not found then raise exception 'Profile missing'; end if;
  stamp=clock_timestamp();
  if exists(select 1 from public.activity_sessions where id=p_session and user_id<>p_user) then raise exception 'Session belongs to another user' using errcode='42501'; end if;
  elapsed=case when previous_seen is null then 0 else greatest(0,least(75,floor(extract(epoch from stamp-previous_seen))))::integer end;
  update public.profiles set last_seen_at=stamp where id=p_user;
  insert into public.activity_sessions(id,user_id,route,last_seen_at) values(p_session,p_user,p_route,stamp)
  on conflict(id) do update set route=p_route,last_seen_at=stamp;
  insert into public.activity_hourly(user_id,hour,active_seconds) values(p_user,date_trunc('hour',stamp),elapsed)
  on conflict(user_id,hour) do update set active_seconds=least(3600,public.activity_hourly.active_seconds+excluded.active_seconds);
  return stamp;
end;
$$;
revoke all on function public.reserve_video_upload(uuid,uuid),public.apply_video_status(text,text,numeric,text,timestamptz),public.consume_rate_limit(text,integer,integer),public.record_presence(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_video_upload(uuid,uuid),public.apply_video_status(text,text,numeric,text,timestamptz),public.consume_rate_limit(text,integer,integer),public.record_presence(uuid,uuid,text) to service_role;

create function public.admin_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$
declare day_start timestamptz=(date_trunc('day',now() at time zone 'Africa/Douala') at time zone 'Africa/Douala');
begin
  if not private.is_admin() then raise exception 'Administrator MFA required' using errcode='42501'; end if;
  return jsonb_build_object('stats',jsonb_build_object(
    'users',(select count(*) from public.profiles),
    'published',(select count(*) from public.content_items where status='published'),
    'drafts',(select count(*) from public.content_items where status='draft'),
    'processing',(select count(*) from public.video_assets where status in ('pending','uploading','processing')),
    'activeToday',(select count(distinct user_id) from public.activity_hourly where hour>=day_start),
    'activitySecondsToday',(select coalesce(sum(active_seconds),0) from public.activity_hourly where hour>=day_start),
    'securityWarnings24h',(select count(*) from public.security_events where created_at>=now()-interval '24 hours' and severity in ('warning','critical'))
  ),'activity',coalesce((select jsonb_agg(x order by x.hour) from (select hour,sum(active_seconds) as seconds from public.activity_hourly where hour>=now()-interval '24 hours' group by hour) x),'[]'::jsonb));
end;
$$;
revoke all on function public.admin_dashboard() from public;
grant execute on function public.admin_dashboard() to authenticated;

create function public.admin_user_activity(p_user_ids uuid[]) returns table(user_id uuid,activity_seconds bigint) language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Administrator MFA required' using errcode='42501'; end if;
  if coalesce(array_length(p_user_ids,1),0)>100 then raise exception 'Too many users'; end if;
  return query select a.user_id,sum(a.active_seconds)::bigint from public.activity_hourly a where a.user_id=any(p_user_ids) and a.hour>=now()-interval '30 days' group by a.user_id;
end;
$$;
revoke all on function public.admin_user_activity(uuid[]) from public;
grant execute on function public.admin_user_activity(uuid[]) to authenticated;

-- Housekeeping is an operator task, not a client action. Call daily through a
-- trusted schedule after setting a retention policy appropriate for the service.
create function public.purge_operational_history() returns void language plpgsql security definer set search_path='' as $$
begin
  delete from private.rate_limits where window_started_at<now()-interval '2 days';
  delete from public.activity_sessions where last_seen_at<now()-interval '30 days';
  delete from public.activity_hourly where hour<now()-interval '30 days';
  delete from public.security_events where created_at<now()-interval '90 days';
end;
$$;
revoke all on function public.purge_operational_history() from public,anon,authenticated;
grant execute on function public.purge_operational_history() to service_role;
