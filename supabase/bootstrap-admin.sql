-- Run manually in the Supabase SQL editor as the project owner, after creating
-- and confirming the intended owner's Auth account. Never execute in the browser.
-- Replace the exact UUID below with the verified account's Auth user UUID.
-- This intentionally fails until a real UUID is supplied.
do $$
declare owner_id uuid := 'REPLACE_WITH_CONFIRMED_OWNER_UUID';
begin
  if not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then
    raise exception 'A confirmed owner account is required';
  end if;
  update public.user_roles set role='admin' where user_id=owner_id;
  if not found then raise exception 'The Epizo profile migration must be applied first'; end if;
  insert into public.security_events(user_id,kind,details)
    values(owner_id,'administrator_bootstrapped',jsonb_build_object('method','operator_sql'));
end $$;
-- The owner must next sign in and enroll/verify TOTP. A role at AAL1 still
-- cannot read the staff catalogue, change content, upload or use the dashboard.
