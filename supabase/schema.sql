-- ============================================================
-- Mesa Waitlist — database schema (Supabase / Postgres)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a fresh project.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Businesses (one row per restaurant / customer) ----------
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text not null check (char_length(name) between 1 and 80),
  brand_color   text not null default '#9C4A26'
                check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  sms_ready     text not null default 'Hi {name}! Your table at {business} is ready. Please check in with the host within 10 minutes. Gracias!'
                check (char_length(sms_ready) <= 320),
  sms_added     text not null default 'Hi {name}, you''re on the waitlist at {business}! Estimated wait: about {wait} min. See your spot in line: {link}'
                check (char_length(sms_added) <= 320),
  self_checkin  boolean not null default false,
  seat_options  text[] not null default array['Any','Inside','Patio','Bar','Booth'],
  quote_options int[]  not null default array[5,10,15,20,25,30,45,60],
  created_at    timestamptz not null default now()
);

-- Platform-only settings (Twilio number, plan). No client access at all.
create table public.business_private (
  business_id uuid primary key references public.businesses on delete cascade,
  sms_from    text,                       -- Twilio number for this business, e.g. +13605551234
  plan        text not null default 'trial',
  created_at  timestamptz not null default now()
);

-- ---------- Staff ----------
create table public.members (
  business_id uuid not null references public.businesses on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('owner','manager','host')),
  email       text,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index members_user_idx on public.members(user_id);

-- ---------- Waitlist parties ----------
create table public.parties (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  phone        text check (phone ~ '^\+[1-9][0-9]{9,14}$'),
  size         int  not null check (size between 1 and 99),
  quote_min    int  check (quote_min between 0 and 600),
  seat         text check (char_length(seat) <= 30),
  tags         text[] not null default '{}',
  notes        text check (char_length(notes) <= 300),
  status       text not null default 'waiting'
               check (status in ('waiting','notified','seated','cancelled','noshow')),
  source       text not null default 'host' check (source in ('host','guest')),
  public_token uuid not null unique default gen_random_uuid(),
  added_at     timestamptz not null default now(),
  notified_at  timestamptz,
  seated_at    timestamptz,
  removed_at   timestamptz,
  created_by   uuid default auth.uid()
);
create index parties_board_idx on public.parties(business_id, status, added_at);

-- ---------- Text message log ----------
create table public.messages (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses on delete cascade,
  party_id    uuid references public.parties on delete set null,
  to_phone    text not null,
  body        text not null,
  kind        text not null,              -- 'ready' | 'added' | 'custom'
  status      text not null,              -- 'sent' | 'failed'
  provider_id text,
  error       text,
  sent_by     uuid,
  created_at  timestamptz not null default now()
);
create index messages_business_idx on public.messages(business_id, created_at desc);

-- ============================================================
-- Helpers
-- ============================================================
create or replace function public.is_member(b uuid, roles text[] default array['owner','manager','host'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where business_id = b and user_id = auth.uid() and role = any(roles)
  );
$$;

create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 10 then return '+1' || d; end if;
  if length(d) = 11 and left(d,1) = '1' then return '+' || d; end if;
  if length(d) between 11 and 15 then return '+' || d; end if;
  raise exception 'invalid phone number' using errcode = '22023';
end $$;

-- Keep timestamps honest whatever the client sends.
create or replace function public.parties_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := now();
    new.phone := public.normalize_phone(new.phone);
  else
    new.business_id := old.business_id;          -- parties never move between businesses
    new.public_token := old.public_token;
    new.added_at := old.added_at;
    if new.phone is distinct from old.phone then new.phone := public.normalize_phone(new.phone); end if;
    if new.status <> old.status then
      if new.status = 'notified' then new.notified_at := now(); end if;
      if new.status = 'seated'   then new.seated_at := now(); end if;
      if new.status in ('cancelled','noshow') then new.removed_at := now(); end if;
      if new.status = 'waiting' then new.seated_at := null; new.removed_at := null; end if;
    end if;
  end if;
  return new;
end $$;
create trigger parties_stamp before insert or update on public.parties
  for each row execute function public.parties_stamp();

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.businesses       enable row level security;
alter table public.business_private enable row level security;
alter table public.members          enable row level security;
alter table public.parties          enable row level security;
alter table public.messages         enable row level security;

create policy biz_read   on public.businesses for select to authenticated using (public.is_member(id));
create policy biz_update on public.businesses for update to authenticated
  using (public.is_member(id, array['owner','manager'])) with check (public.is_member(id, array['owner','manager']));

create policy mem_read   on public.members for select to authenticated using (public.is_member(business_id));
create policy mem_update on public.members for update to authenticated
  using (public.is_member(business_id, array['owner']) and user_id <> auth.uid())
  with check (public.is_member(business_id, array['owner']));
create policy mem_delete on public.members for delete to authenticated
  using (public.is_member(business_id, array['owner']) and user_id <> auth.uid());

create policy party_read   on public.parties for select to authenticated using (public.is_member(business_id));
create policy party_insert on public.parties for insert to authenticated with check (public.is_member(business_id));
create policy party_update on public.parties for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy party_delete on public.parties for delete to authenticated
  using (public.is_member(business_id, array['owner','manager']));

create policy msg_read on public.messages for select to authenticated using (public.is_member(business_id));
-- business_private: no policies → only the server (service role) can touch it.

-- ============================================================
-- Functions the app calls
-- ============================================================

-- Sign-up flow: a signed-in user creates their business and becomes owner.
create or replace function public.create_business(p_name text, p_slug text)
returns public.businesses language plpgsql security definer set search_path = public as $$
declare b public.businesses;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'business limit reached' using errcode = '54000';
  end if;
  insert into public.businesses(name, slug) values (trim(p_name), lower(trim(p_slug))) returning * into b;
  insert into public.business_private(business_id) values (b.id);
  insert into public.members(business_id, user_id, role, email)
    values (b.id, auth.uid(), 'owner', auth.jwt() ->> 'email');
  return b;
end $$;

-- Guest status page: "You're #3 in line".
create or replace function public.get_party_status(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'business',    b.name,
    'brand_color', b.brand_color,
    'name',        split_part(p.name, ' ', 1),
    'size',        p.size,
    'status',      p.status,
    'quote_min',   p.quote_min,
    'added_at',    p.added_at,
    'position',    case when p.status in ('waiting','notified') then (
                     select count(*) + 1 from public.parties q
                     where q.business_id = p.business_id
                       and q.status in ('waiting','notified')
                       and q.added_at < p.added_at) end
  )
  from public.parties p join public.businesses b on b.id = p.business_id
  where p.public_token = p_token
    and p.added_at > now() - interval '1 day';
$$;

-- Guest leaves the line from their status page.
create or replace function public.guest_cancel(p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.parties set status = 'cancelled'
    where public_token = p_token and status in ('waiting','notified')
      and added_at > now() - interval '1 day'
    returning 1)
  select exists (select 1 from u);
$$;

-- QR self check-in page info.
create or replace function public.get_join_info(p_slug text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', b.name, 'brand_color', b.brand_color, 'open', b.self_checkin,
    'waiting', (select count(*) from public.parties p
                where p.business_id = b.id and p.status in ('waiting','notified')))
  from public.businesses b where b.slug = lower(p_slug);
$$;

-- QR self check-in: guest adds themselves. Returns their status-page token.
create or replace function public.guest_join(p_slug text, p_name text, p_phone text, p_size int)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.businesses; ph text; tok uuid;
begin
  select * into b from public.businesses where slug = lower(p_slug);
  if b.id is null or not b.self_checkin then
    raise exception 'check-in is closed' using errcode = '42501';
  end if;
  ph := public.normalize_phone(p_phone);
  if ph is null then raise exception 'phone required' using errcode = '22023'; end if;
  if p_size is null or p_size < 1 or p_size > 20 then
    raise exception 'invalid party size' using errcode = '22023';
  end if;
  -- Same phone already in line → hand back their existing spot.
  select public_token into tok from public.parties
    where business_id = b.id and phone = ph and status in ('waiting','notified')
    order by added_at desc limit 1;
  if tok is not null then return tok; end if;
  if (select count(*) from public.parties where business_id = b.id and source = 'guest'
        and added_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many check-ins, please see the host' using errcode = '54000';
  end if;
  insert into public.parties(business_id, name, phone, size, source, created_by)
    values (b.id, left(trim(p_name), 60), ph, p_size, 'guest', null)
    returning public_token into tok;
  return tok;
end $$;

-- ============================================================
-- Permissions
-- ============================================================
revoke all on function public.create_business(text,text)                from public, anon;
revoke all on function public.get_party_status(uuid)                     from public;
revoke all on function public.guest_cancel(uuid)                         from public;
revoke all on function public.get_join_info(text)                        from public;
revoke all on function public.guest_join(text,text,text,int)             from public;
grant execute on function public.create_business(text,text)              to authenticated;
grant execute on function public.get_party_status(uuid)                  to anon, authenticated;
grant execute on function public.guest_cancel(uuid)                      to anon, authenticated;
grant execute on function public.get_join_info(text)                     to anon, authenticated;
grant execute on function public.guest_join(text,text,text,int)          to anon, authenticated;

-- Live updates for the host screen.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.parties;
  end if;
end $$;
