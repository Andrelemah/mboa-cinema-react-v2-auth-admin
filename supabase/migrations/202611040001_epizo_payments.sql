create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'paystack' check (provider = 'paystack'),
  reference text not null unique check (reference ~ '^[A-Za-z0-9_-]{8,100}$'),
  plan text not null check (plan in ('mobile','plus')),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  channels text[] not null check (
    'card'=any(channels)
    and array_position(channels,null) is null
    and channels <@ array['card','mobile_money']::text[]
  ),
  payment_channel text check (payment_channel is null or payment_channel=any(channels)),
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  gateway_transaction_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payment_transactions_user_created_idx on public.payment_transactions(user_id,created_at desc);
alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from public,anon,authenticated;
grant select on public.payment_transactions to authenticated;
grant all on public.payment_transactions to service_role;
create policy payment_transaction_read on public.payment_transactions for select to authenticated
  using (user_id=auth.uid() or private.is_admin());

create function public.complete_paystack_transaction(
  p_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_gateway_transaction_id text,
  p_payment_channel text
) returns public.payment_transactions
language plpgsql security definer set search_path='' as $$
declare
  payment public.payment_transactions;
  subscription_start timestamptz;
  subscription_expiry_base timestamptz;
begin
  if p_reference is null
     or p_amount_minor is null
     or p_currency is null
     or p_gateway_transaction_id is null
     or p_payment_channel is null
     or p_reference !~ '^[A-Za-z0-9_-]{8,100}$'
     or p_amount_minor < 1
     or p_currency !~ '^[A-Z]{3}$'
     or p_gateway_transaction_id !~ '^[A-Za-z0-9_-]{1,100}$'
     or p_payment_channel not in ('card','mobile_money') then
    raise exception 'Invalid verified payment data' using errcode='22023';
  end if;

  select * into payment from public.payment_transactions where reference=p_reference for update;
  if not found then raise exception 'Payment reference not found' using errcode='P0002'; end if;
  if payment.amount_minor<>p_amount_minor or payment.currency<>p_currency then
    raise exception 'Verified payment does not match the order' using errcode='22023';
  end if;
  if not p_payment_channel=any(payment.channels) then
    raise exception 'Payment channel does not match the order' using errcode='22023';
  end if;
  if payment.status='succeeded' then
    if payment.gateway_transaction_id<>p_gateway_transaction_id or payment.payment_channel<>p_payment_channel then
      raise exception 'Payment transaction identifier does not match' using errcode='22023';
    end if;
    return payment;
  end if;
  if payment.status<>'pending' then raise exception 'Payment is not pending' using errcode='P0001'; end if;

  update public.payment_transactions
    set status='succeeded',gateway_transaction_id=p_gateway_transaction_id,payment_channel=p_payment_channel,paid_at=now(),updated_at=now()
    where id=payment.id returning * into payment;

  perform 1 from public.user_roles where user_id=payment.user_id for update;
  if not found then raise exception 'Account role not found' using errcode='P0002'; end if;
  select
    case when status='active' and starts_at<=now() and expires_at>now() then starts_at else now() end,
    case when status='active' and expires_at>now() then expires_at else now() end
    into subscription_start,subscription_expiry_base from public.subscriptions where user_id=payment.user_id;
  if subscription_start is null then subscription_start=now(); end if;
  if subscription_expiry_base is null then subscription_expiry_base=now(); end if;
  insert into public.subscriptions(user_id,plan,status,starts_at,expires_at,updated_at)
    values(payment.user_id,payment.plan,'active',subscription_start,subscription_expiry_base+interval '30 days',now())
    on conflict(user_id) do update set
      plan=excluded.plan,status='active',starts_at=excluded.starts_at,
      expires_at=excluded.expires_at,updated_at=now();
  return payment;
end;
$$;
revoke all on function public.complete_paystack_transaction(text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_paystack_transaction(text,bigint,text,text,text) to service_role;
