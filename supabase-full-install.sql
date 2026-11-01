-- Yazboz: BOŞ bir Supabase projesine tam kurulum.
-- supabase-schema.sql ve supabase-migrations/ dosyalarının sırayla birleşimidir
-- (020 hariç: yalnızca eski verideki bozuk kayıtları onarır).
-- Tek transaction: bir hata olursa hiçbir değişiklik kalmaz.

begin;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public') then
    raise exception 'Bu projenin public şemasında tablo var, kurulum durduruldu. Doğru projede olduğunuzu kontrol edin.';
  end if;
end $$;

-- ═══════════════ supabase-schema.sql ═══════════════
-- Yazboz - Cezalı Okey Supabase Şeması
-- Bu dosyayı Supabase SQL Editor'de çalıştırın

-- Kullanıcı profilleri
create table if not exists profiles (
  id uuid references auth.users primary key,
  username text,
  winners_count integer default 1,
  created_at timestamptz default now()
);

-- Yeni kullanıcı profili otomatik oluştur
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Oyunlar
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  game_type text default 'cezali_okey',
  game_subtype text default 'solo',
  status text default 'active' check (status in ('active', 'finished')),
  total_rounds integer default 11,
  players jsonb not null,
  teams jsonb,
  settings jsonb,
  created_at timestamptz default now(),
  finished_at timestamptz
);

-- Eller (roundlar)
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games on delete cascade not null,
  round_number integer not null,
  color text not null check (color in ('black', 'red', 'yellow', 'green')),
  okey_thrown boolean default false,
  double_finish boolean default false,
  fake_okey boolean default false,
  scores jsonb not null,
  indicator_players jsonb default '[]',
  is_indicator_only boolean default false,
  created_at timestamptz default now(),
  unique(game_id, round_number)
);

-- İndeksler
create index if not exists games_user_id_idx on games(user_id);
create index if not exists games_status_idx on games(status);
create index if not exists rounds_game_id_idx on rounds(game_id);

-- RLS Politikaları
alter table profiles enable row level security;
alter table games enable row level security;
alter table rounds enable row level security;

-- Profiles RLS
create policy "Kullanıcı kendi profilini görür"
  on profiles for select using (auth.uid() = id);

create policy "Kullanıcı kendi profilini güncelleyebilir"
  on profiles for update using (auth.uid() = id);

-- Games RLS
create policy "Kullanıcı kendi oyunlarını görür"
  on games for select using (auth.uid() = user_id);

create policy "Kullanıcı oyun oluşturabilir"
  on games for insert with check (auth.uid() = user_id);

create policy "Kullanıcı kendi oyunlarını güncelleyebilir"
  on games for update using (auth.uid() = user_id);

create policy "Kullanıcı kendi oyunlarını silebilir"
  on games for delete using (auth.uid() = user_id);

-- Rounds RLS
create policy "Kullanıcı kendi oyunlarının ellerini görür"
  on rounds for select using (
    game_id in (select id from games where user_id = auth.uid())
  );

create policy "Kullanıcı kendi oyunlarına el ekleyebilir"
  on rounds for insert with check (
    game_id in (select id from games where user_id = auth.uid())
  );

create policy "Kullanıcı kendi oyunlarının ellerini güncelleyebilir"
  on rounds for update using (
    game_id in (select id from games where user_id = auth.uid())
  );

create policy "Kullanıcı kendi oyunlarının ellerini silebilir"
  on rounds for delete using (
    game_id in (select id from games where user_id = auth.uid())
  );

-- Oyuncu listesi
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

create index if not exists players_user_id_idx on players(user_id);

alter table players enable row level security;

create policy "Kullanıcı kendi oyuncularını yönetir"
  on players for all using (auth.uid() = user_id);

-- Avatar storage
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar yükle"
  on storage.objects for insert
  with check (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatar görüntüle"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Avatar güncelle"
  on storage.objects for update
  using (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatar sil"
  on storage.objects for delete
  using (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Mevcut veritabanları için (fake_okey kolonu yoksa):
-- alter table rounds add column if not exists fake_okey boolean default false;

-- ═══════════════ 001_add_fake_okey.sql ═══════════════
-- Mevcut veritabanlarına fake_okey kolonu ekle
alter table rounds add column if not exists fake_okey boolean default false;

-- ═══════════════ 002_add_winners_count.sql ═══════════════
alter table profiles add column if not exists winners_count integer default 1;

-- ═══════════════ 003_game_types.sql ═══════════════
alter table games add column if not exists teams jsonb;
alter table games add column if not exists game_subtype text default 'solo';
alter table rounds add column if not exists indicator_players jsonb default '[]';

-- ═══════════════ 004_add_is_indicator_only.sql ═══════════════
alter table rounds add column if not exists is_indicator_only boolean default false;

-- ═══════════════ 005_add_101_okey.sql ═══════════════
alter table games add column if not exists katlamali boolean default false;

-- ═══════════════ 006_add_bankolu_okey.sql ═══════════════
alter table rounds add column if not exists banko_players jsonb default '[]';

alter table games add column if not exists banko_history jsonb default '{}';

-- ═══════════════ 007_social_and_groups.sql ═══════════════
-- ============================================================
-- 007 Social: profiles, groups, friends
-- ============================================================

-- Profiles extensions
alter table profiles
  add column if not exists username     text unique,
  add column if not exists display_name text,
  add column if not exists avatar_url   text,
  add column if not exists bio          text,
  add column if not exists created_at   timestamptz default now();

create unique index if not exists profiles_username_idx on profiles(username);

-- Players: link to auth user
alter table players
  add column if not exists linked_user_id uuid references auth.users;

-- Games: who recorded
alter table games
  add column if not exists recorded_by uuid references auth.users;

-- ── Groups ────────────────────────────────────────────────
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid references auth.users not null,
  invite_code text unique not null,
  created_at  timestamptz default now()
);

alter table groups enable row level security;

create policy "Grup sahibi grubu görür"
  on groups for select using (owner_id = auth.uid());

create policy "Kullanıcı grup oluşturabilir"
  on groups for insert
  with check (owner_id = auth.uid());

create policy "Grup sahibi grubu yönetir"
  on groups for all using (owner_id = auth.uid());

-- ── Group members ─────────────────────────────────────────
create table if not exists group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups not null,
  user_id    uuid references auth.users not null,
  role       text default 'member',
  joined_at  timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_members enable row level security;

create policy "Üyeler grup üyelerini görür"
  on group_members for select using (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Üye ekle/katıl"
  on group_members for insert with check (user_id = auth.uid());

create policy "Üye çık veya admin çıkarsın"
  on group_members for delete using (
    user_id = auth.uid() or
    group_id in (select id from groups where owner_id = auth.uid())
  );

-- ── Group games ───────────────────────────────────────────
create table if not exists group_games (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups not null,
  game_id    uuid references games not null,
  created_at timestamptz default now(),
  unique(group_id, game_id)
);

alter table group_games enable row level security;

create policy "Grup üyeleri grup oyunlarını görür"
  on group_games for select using (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

create policy "Grup üyesi oyun ekleyebilir"
  on group_games for insert with check (
    group_id in (select group_id from group_members where user_id = auth.uid())
  );

-- ── Friend requests ───────────────────────────────────────
create table if not exists friend_requests (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid references auth.users not null,
  receiver_id uuid references auth.users not null,
  status      text default 'pending',
  created_at  timestamptz default now(),
  unique(sender_id, receiver_id)
);

alter table friend_requests enable row level security;

create policy "Kullanıcı kendi isteklerini görür"
  on friend_requests for select using (
    sender_id = auth.uid() or receiver_id = auth.uid()
  );

create policy "İstek gönder"
  on friend_requests for insert with check (sender_id = auth.uid());

create policy "İsteği güncelle (alıcı)"
  on friend_requests for update using (receiver_id = auth.uid());

-- ── Friends ───────────────────────────────────────────────
create table if not exists friends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  friend_id  uuid references auth.users not null,
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

alter table friends enable row level security;

create policy "Kullanıcı arkadaşlarını görür"
  on friends for select using (
    user_id = auth.uid() or friend_id = auth.uid()
  );

create policy "Arkadaş ekle"
  on friends for insert with check (user_id = auth.uid());

create policy "Arkadaşlığı kaldır"
  on friends for delete using (user_id = auth.uid());

-- ═══════════════ 008_fix_group_rls.sql ═══════════════
-- Fix group creation RLS policies
-- FOR ALL policy alone may not grant INSERT reliably in all Postgres/Supabase setups

drop policy if exists "Kullanıcı grup oluşturabilir" on groups;
create policy "Kullanıcı grup oluşturabilir"
  on groups for insert
  with check (owner_id = auth.uid());

-- Owner can read their group before group_members row exists (post-insert .select())
drop policy if exists "Grup sahibi grubu görür" on groups;
create policy "Grup sahibi grubu görür"
  on groups for select
  using (owner_id = auth.uid());

drop policy if exists "Grup üyesi eklenebilir" on group_members;
create policy "Grup üyesi eklenebilir"
  on group_members for insert
  with check (user_id = auth.uid());

-- ═══════════════ 009_fix_group_list_and_join.sql ═══════════════
-- Fix group list + join by invite code

-- Users can always read their own membership rows (fixes list fetch)
drop policy if exists "Kendi üyeliklerini gör" on group_members;
create policy "Kendi üyeliklerini gör"
  on group_members for select
  using (user_id = auth.uid());

-- Helper to avoid RLS recursion on group_members subqueries
create or replace function public.get_my_group_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from public.group_members where user_id = auth.uid();
$$;

grant execute on function public.get_my_group_ids() to authenticated;

-- Consolidated groups SELECT (members + owners)
drop policy if exists "Gruplar görülebilir" on groups;
create policy "Gruplar görülebilir"
  on groups for select using (
    id in (select public.get_my_group_ids())
    or owner_id = auth.uid()
  );

-- group_members: see co-members in shared groups
drop policy if exists "Üyeleri gör" on group_members;
create policy "Üyeleri gör"
  on group_members for select using (
    user_id = auth.uid()
    or group_id in (select public.get_my_group_ids())
  );

drop policy if exists "Üye ekle" on group_members;
create policy "Üye ekle"
  on group_members for insert
  with check (user_id = auth.uid());

-- Lookup group by invite code (non-members can't read groups table directly)
create or replace function public.lookup_group_by_invite_code(p_code text)
returns table (id uuid, name text, invite_code text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.name, g.invite_code
  from public.groups g
  where g.invite_code = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.lookup_group_by_invite_code(text) to authenticated;

-- ═══════════════ 010_profiles_read_policy.sql ═══════════════
-- Allow authenticated users to read profiles (needed for group members, friends list)
alter table profiles enable row level security;

drop policy if exists "Profiller okunabilir" on profiles;
create policy "Profiller okunabilir"
  on profiles for select
  to authenticated
  using (true);

drop policy if exists "Kullanıcı kendi profilini günceller" on profiles;
create policy "Kullanıcı kendi profilini günceller"
  on profiles for update
  using (id = auth.uid());

drop policy if exists "Kullanıcı kendi profilini oluşturur" on profiles;
create policy "Kullanıcı kendi profilini oluşturur"
  on profiles for insert
  with check (id = auth.uid());

-- ═══════════════ 011_fix_profiles_save_and_search.sql ═══════════════
-- Fix profile save (upsert) and username search

alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists bio text;

alter table profiles enable row level security;

-- SELECT: authenticated users can read profiles (friend search, group members)
drop policy if exists "Kullanıcı kendi profilini görür" on profiles;
drop policy if exists "Profiller okunabilir" on profiles;
create policy "Profiller okunabilir"
  on profiles for select
  to authenticated
  using (true);

-- INSERT
drop policy if exists "Kullanıcı kendi profilini oluşturur" on profiles;
create policy "Kullanıcı kendi profilini oluşturur"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE (with check for upsert)
drop policy if exists "Kullanıcı kendi profilini güncelleyebilir" on profiles;
drop policy if exists "Kullanıcı kendi profilini günceller" on profiles;
create policy "Kullanıcı kendi profilini günceller"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Username search (bypasses RLS edge cases)
create or replace function public.search_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where lower(trim(p.username)) = lower(trim(both '@' from p_username))
  limit 1;
$$;

create or replace function public.check_username_available(
  p_username text,
  p_exclude_user_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(trim(username)) = lower(trim(p_username))
      and (p_exclude_user_id is null or id <> p_exclude_user_id)
  );
$$;

grant execute on function public.search_profile_by_username(text) to authenticated;
grant execute on function public.check_username_available(text, uuid) to authenticated;

-- ═══════════════ 012_friend_request_sender_policies.sql ═══════════════
-- Friend request: sender can delete/resubmit rejected requests

drop policy if exists "Gönderen isteği silebilir" on friend_requests;
create policy "Gönderen isteği silebilir"
  on friend_requests for delete
  using (sender_id = auth.uid());

drop policy if exists "Gönderen isteği günceller" on friend_requests;
create policy "Gönderen isteği günceller"
  on friend_requests for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ═══════════════ 013_send_friend_request_rpc.sql ═══════════════
-- Reliable friend request send via security definer RPC

create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_existing public.friend_requests%rowtype;
  v_reverse public.friend_requests%rowtype;
  v_new_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Kendine istek gönderemezsin';
  end if;

  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  -- Karşı taraf zaten istek gönderdiyse otomatik kabul et
  select * into v_reverse
  from public.friend_requests
  where sender_id = p_receiver_id
    and receiver_id = v_sender_id
    and status = 'pending';

  if found then
    update public.friend_requests
    set status = 'accepted'
    where id = v_reverse.id;

    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict do nothing;

    return v_reverse.id;
  end if;

  select * into v_existing
  from public.friend_requests
  where sender_id = v_sender_id
    and receiver_id = p_receiver_id;

  if found then
    if v_existing.status = 'pending' then
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    elsif v_existing.status = 'accepted' then
      raise exception 'Zaten arkadaşsınız';
    elsif v_existing.status = 'rejected' then
      delete from public.friend_requests where id = v_existing.id;
    else
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- ═══════════════ 014_fix_friend_request_insert_rls.sql ═══════════════
-- Fix friend_requests INSERT RLS + ensure send_friend_request RPC bypasses RLS

-- Tüm mevcut politikaları temizle
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'friend_requests'
  loop
    execute format('drop policy if exists %I on public.friend_requests', pol.policyname);
  end loop;
end $$;

alter table public.friend_requests enable row level security;

-- Tablo izinleri
grant select, insert, update, delete on public.friend_requests to authenticated;

create policy "friend_requests_select"
  on public.friend_requests for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "friend_requests_insert"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() is not null
    and sender_id = auth.uid()
    and receiver_id <> auth.uid()
  );

create policy "friend_requests_update_receiver"
  on public.friend_requests for update
  to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

create policy "friend_requests_update_sender"
  on public.friend_requests for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "friend_requests_delete_sender"
  on public.friend_requests for delete
  to authenticated
  using (sender_id = auth.uid());

-- friends tablosu: RPC otomatik kabul için
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'friends'
  loop
    execute format('drop policy if exists %I on public.friends', pol.policyname);
  end loop;
end $$;

alter table public.friends enable row level security;
grant select, insert, delete on public.friends to authenticated;

create policy "friends_select"
  on public.friends for select
  to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

create policy "friends_insert"
  on public.friends for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "friends_delete"
  on public.friends for delete
  to authenticated
  using (user_id = auth.uid());

-- RPC: supabase_admin sahibi → RLS bypass
create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_existing public.friend_requests%rowtype;
  v_reverse public.friend_requests%rowtype;
  v_new_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Kendine istek gönderemezsin';
  end if;

  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  -- Karşı taraf zaten istek gönderdiyse otomatik kabul et
  select * into v_reverse
  from public.friend_requests
  where sender_id = p_receiver_id
    and receiver_id = v_sender_id
    and status = 'pending';

  if found then
    update public.friend_requests
    set status = 'accepted'
    where id = v_reverse.id;

    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict do nothing;

    return v_reverse.id;
  end if;

  select * into v_existing
  from public.friend_requests
  where sender_id = v_sender_id
    and receiver_id = p_receiver_id;

  if found then
    if v_existing.status = 'pending' then
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    elsif v_existing.status = 'accepted' then
      raise exception 'Zaten arkadaşsınız';
    elsif v_existing.status = 'rejected' then
      delete from public.friend_requests where id = v_existing.id;
    else
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

alter function public.send_friend_request(uuid) owner to postgres;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ═══════════════ 015_respond_friend_request_rpc.sql ═══════════════
-- Accept/reject friend requests via RPC (creates both friendship rows)
-- Also repair send_friend_request for already-accepted-but-missing-friends

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_req
  from public.friend_requests
  where id = p_request_id
    and receiver_id = v_user_id
    and status = 'pending';

  if not found then
    raise exception 'İstek bulunamadı veya zaten yanıtlandı';
  end if;

  if p_accept then
    update public.friend_requests
    set status = 'accepted'
    where id = p_request_id;

    insert into public.friends (user_id, friend_id)
    values (v_req.sender_id, v_req.receiver_id), (v_req.receiver_id, v_req.sender_id)
    on conflict (user_id, friend_id) do nothing;

    return jsonb_build_object(
      'accepted', true,
      'sender_id', v_req.sender_id,
      'receiver_id', v_req.receiver_id
    );
  end if;

  update public.friend_requests
  set status = 'rejected'
  where id = p_request_id;

  return jsonb_build_object('accepted', false);
end;
$$;

alter function public.respond_friend_request(uuid, boolean) owner to postgres;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- send_friend_request: friends kontrolü + kabul edilmiş ama eksik kayıt onarımı
create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_existing public.friend_requests%rowtype;
  v_reverse public.friend_requests%rowtype;
  v_new_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Kendine istek gönderemezsin';
  end if;

  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  if exists (
    select 1 from public.friends
    where user_id = v_sender_id and friend_id = p_receiver_id
  ) then
    raise exception 'Zaten arkadaşsınız';
  end if;

  -- Onarım: kabul edilmiş istek var ama friends kaydı eksik
  if exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and (
        (sender_id = v_sender_id and receiver_id = p_receiver_id)
        or (sender_id = p_receiver_id and receiver_id = v_sender_id)
      )
  ) then
    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict (user_id, friend_id) do nothing;
    raise exception 'Zaten arkadaşsınız';
  end if;

  select * into v_reverse
  from public.friend_requests
  where sender_id = p_receiver_id
    and receiver_id = v_sender_id
    and status = 'pending';

  if found then
    update public.friend_requests
    set status = 'accepted'
    where id = v_reverse.id;

    insert into public.friends (user_id, friend_id)
    values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
    on conflict (user_id, friend_id) do nothing;

    return v_reverse.id;
  end if;

  select * into v_existing
  from public.friend_requests
  where sender_id = v_sender_id
    and receiver_id = p_receiver_id;

  if found then
    if v_existing.status = 'pending' then
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    elsif v_existing.status = 'accepted' then
      insert into public.friends (user_id, friend_id)
      values (v_sender_id, p_receiver_id), (p_receiver_id, v_sender_id)
      on conflict (user_id, friend_id) do nothing;
      raise exception 'Zaten arkadaşsınız';
    elsif v_existing.status = 'rejected' then
      delete from public.friend_requests where id = v_existing.id;
    else
      raise exception 'Bu kullanıcıya zaten istek gönderdin';
    end if;
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

alter function public.send_friend_request(uuid) owner to postgres;

-- Mevcut kabul edilmiş istekler için eksik friends kayıtlarını onar
insert into public.friends (user_id, friend_id)
select fr.sender_id, fr.receiver_id
from public.friend_requests fr
where fr.status = 'accepted'
  and not exists (
    select 1 from public.friends f
    where f.user_id = fr.sender_id and f.friend_id = fr.receiver_id
  )
on conflict (user_id, friend_id) do nothing;

insert into public.friends (user_id, friend_id)
select fr.receiver_id, fr.sender_id
from public.friend_requests fr
where fr.status = 'accepted'
  and not exists (
    select 1 from public.friends f
    where f.user_id = fr.receiver_id and f.friend_id = fr.sender_id
  )
on conflict (user_id, friend_id) do nothing;

-- ═══════════════ 016_remove_friend_rpc.sql ═══════════════
-- Remove friendship from both sides + clean up friend_requests

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_user_id = p_friend_id then
    raise exception 'Geçersiz işlem';
  end if;

  if not exists (
    select 1 from public.friends
    where user_id = v_user_id and friend_id = p_friend_id
  ) then
    raise exception 'Arkadaş bulunamadı';
  end if;

  delete from public.friends
  where (user_id = v_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_user_id);

  delete from public.friend_requests
  where (sender_id = v_user_id and receiver_id = p_friend_id)
     or (sender_id = p_friend_id and receiver_id = v_user_id);

  update public.players
  set linked_user_id = null
  where (user_id = v_user_id and linked_user_id = p_friend_id)
     or (user_id = p_friend_id and linked_user_id = v_user_id);
end;
$$;

alter function public.remove_friend(uuid) owner to postgres;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ═══════════════ 017_friend_merge_prompted.sql ═══════════════
-- Track whether merge prompt was shown after friend accept

alter table public.friend_requests
  add column if not exists merge_prompted boolean default false;

-- ═══════════════ 018_notifications_and_merge.sql ═══════════════
-- Notifications + merge_requests + friend game read access

-- ── Notifications ─────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb default '{}'::jsonb,
  is_read    boolean default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() is not null);

grant select, insert, update on public.notifications to authenticated;

-- ── Merge requests ────────────────────────────────────────
create table if not exists public.merge_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid references auth.users not null,
  target_id       uuid references auth.users not null,
  local_player_id uuid,
  status          text default 'pending',
  created_at      timestamptz default now(),
  unique(requester_id, target_id)
);

alter table public.merge_requests enable row level security;

drop policy if exists "merge_requests_select" on public.merge_requests;
create policy "merge_requests_select"
  on public.merge_requests for select
  to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists "merge_requests_insert" on public.merge_requests;
create policy "merge_requests_insert"
  on public.merge_requests for insert
  to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "merge_requests_update" on public.merge_requests;
create policy "merge_requests_update"
  on public.merge_requests for update
  to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

grant select, insert, update on public.merge_requests to authenticated;

-- ── Friend games read (for cross-stats) ───────────────────
drop policy if exists "Arkadaş oyunlarını görür" on public.games;
create policy "Arkadaş oyunlarını görür"
  on public.games for select
  to authenticated
  using (
    user_id = auth.uid()
    or user_id in (
      select friend_id from public.friends where user_id = auth.uid()
    )
  );

drop policy if exists "Arkadaş roundlarını görür" on public.rounds;
create policy "Arkadaş roundlarını görür"
  on public.rounds for select
  to authenticated
  using (
    game_id in (
      select id from public.games
      where user_id = auth.uid()
        or user_id in (
          select friend_id from public.friends where user_id = auth.uid()
        )
    )
  );

-- ── Group delete for owner ────────────────────────────────
drop policy if exists "Grup sahibi silebilir" on public.groups;
create policy "Grup sahibi silebilir"
  on public.groups for delete
  to authenticated
  using (owner_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.notifications;

-- ═══════════════ 019_lock_social_writes.sql ═══════════════
-- Sosyal tablolara doğrudan yazmayı kapatır.
-- Arkadaşlık, grup üyeliği ve bildirimler artık yalnızca doğrulama yapan
-- security definer fonksiyonlarla oluşur. Eski istemci bu tablolara yazamaz:
-- bu migration'ı çalıştırdıktan hemen sonra istemciyi yayınlayın.

-- ── Açık INSERT politikalarını kaldır ─────────────────────
do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('friends', 'friend_requests', 'group_members', 'notifications')
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

revoke insert, update on public.friends from anon, authenticated;
revoke insert, update on public.friend_requests from anon, authenticated;
revoke insert, update on public.group_members from anon, authenticated;
revoke insert on public.notifications from anon, authenticated;

-- status yalnızca RPC ile değişir; istemci sadece merge_prompted'ı işaretler
grant update (merge_prompted) on public.friend_requests to authenticated;

-- 007'den kalan bu politika kendine başvurup "infinite recursion" hatası veriyor;
-- yerini 009'daki "Üyeleri gör" aldı
drop policy if exists "Üyeler grup üyelerini görür" on public.group_members;

-- group_members silme politikasıyla döngü oluşturur; yerini 009'daki "Gruplar görülebilir" aldı
drop policy if exists "Grup üyeleri grubu görür" on public.groups;

-- ── Grup sahibi üyeliği ───────────────────────────────────
create or replace function public.add_group_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

alter function public.add_group_owner_as_admin() owner to postgres;
revoke all on function public.add_group_owner_as_admin() from public, anon, authenticated;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.add_group_owner_as_admin();

-- ── Davet koduyla gruba katılma ───────────────────────────
create or replace function public.join_group_by_invite_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.groups%rowtype;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  -- Eşzamanlı katılımlarda üye sınırı aşılmasın diye grup satırını kilitle
  select * into v_group
  from public.groups
  where invite_code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Geçersiz davet kodu';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_group.id and user_id = v_user_id
  ) then
    raise exception 'Zaten bu grubun üyesisin';
  end if;

  if (select count(*) from public.group_members where group_id = v_group.id) >= 10 then
    raise exception 'Grup dolu (maksimum 10 üye)';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user_id, 'member');

  return v_group;
end;
$$;

alter function public.join_group_by_invite_code(text) owner to postgres;
revoke all on function public.join_group_by_invite_code(text) from public, anon;
grant execute on function public.join_group_by_invite_code(text) to authenticated;

-- ── Bildirim gönderme ─────────────────────────────────────
-- Metin ve veri sunucuda üretilir: istemci yalnızca alıcıyı ve türü seçer.
create or replace function public.send_notification(p_receiver_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_name text;
  v_request_id uuid;
  v_title text;
  v_body text;
  v_data jsonb;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Geçersiz alıcı';
  end if;

  if p_type = 'friend_request' then
    select id into v_request_id
    from public.friend_requests
    where sender_id = v_sender_id
      and receiver_id = p_receiver_id
      and status = 'pending';

    if not found then
      raise exception 'Bekleyen arkadaşlık isteği bulunamadı';
    end if;
  elsif not exists (
    select 1 from public.friends
    where user_id = v_sender_id and friend_id = p_receiver_id
  ) then
    raise exception 'Bu kullanıcıya bildirim gönderemezsin';
  end if;

  -- Aynı kişiden aynı türde okunmamış bildirim varsa tekrar gönderme
  if exists (
    select 1 from public.notifications
    where user_id = p_receiver_id
      and type = p_type
      and is_read = false
      and data->>'actor_id' = v_sender_id::text
  ) then
    return;
  end if;

  select display_name into v_name from public.profiles where id = v_sender_id;
  v_name := coalesce(nullif(trim(v_name), ''), 'Birisi');

  case p_type
    when 'friend_request' then
      v_title := 'Arkadaşlık İsteği';
      v_body := v_name || ' sana arkadaşlık isteği gönderdi';
      v_data := jsonb_build_object(
        'sender_id', v_sender_id,
        'sender_name', v_name,
        'request_id', v_request_id
      );
    when 'friend_accepted' then
      v_title := 'Arkadaşlık İsteği Kabul Edildi';
      v_body := v_name || ' arkadaşlık isteğini kabul etti';
      v_data := jsonb_build_object('friend_id', v_sender_id, 'friend_name', v_name);
    when 'merge_notify' then
      v_title := 'Arkadaşlık';
      v_body := v_name || ' arkadaşlık isteğini kabul etti';
      v_data := jsonb_build_object('friend_id', v_sender_id, 'friend_name', v_name);
    when 'merge_request' then
      v_title := 'Profil Birleştirme';
      v_body := v_name || ' seni yerel oyuncusuyla birleştirmek istiyor';
      v_data := jsonb_build_object(
        'requester_id', v_sender_id,
        'requester_name', v_name,
        'friend_user_id', v_sender_id
      );
    when 'merge_done' then
      v_title := 'Profil Birleştirildi';
      v_body := v_name || ' seni kendi yerel oyuncusuyla birleştirdi. İstatistiklerini kontrol et.';
      v_data := jsonb_build_object('merged_by', v_sender_id, 'merged_by_name', v_name);
    else
      raise exception 'Geçersiz bildirim türü';
  end case;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_receiver_id,
    p_type,
    v_title,
    v_body,
    v_data || jsonb_build_object('actor_id', v_sender_id)
  );
end;
$$;

alter function public.send_notification(uuid, text) owner to postgres;
revoke all on function public.send_notification(uuid, text) from public, anon;
grant execute on function public.send_notification(uuid, text) to authenticated;

-- ── Geçmişte kötüye kullanım var mı? (salt okunur, elle çalıştırın) ──
-- Kabul edilmiş isteği olmayan arkadaşlıklar:
--   select f.* from public.friends f
--   where not exists (
--     select 1 from public.friend_requests fr
--     where fr.status = 'accepted'
--       and ((fr.sender_id = f.user_id and fr.receiver_id = f.friend_id)
--         or (fr.sender_id = f.friend_id and fr.receiver_id = f.user_id))
--   );
-- Grup sahibi olmayan adminler:
--   select gm.* from public.group_members gm
--   join public.groups g on g.id = gm.group_id
--   where gm.role = 'admin' and gm.user_id <> g.owner_id;

-- ═══════════════ 021_group_delete_cascade.sql ═══════════════
-- İstemci grubu silerken yalnızca groups satırını siliyor; üyelikler ve oyun
-- bağlantıları veritabanında yayılarak silinmeli. Eski veritabanında bu elle
-- yapılmıştı, dosyalara girmediği için temiz kurulumda grup silme hata veriyordu.

alter table public.group_members
  drop constraint if exists group_members_group_id_fkey,
  add constraint group_members_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete cascade;

alter table public.group_games
  drop constraint if exists group_games_group_id_fkey,
  add constraint group_games_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete cascade,
  drop constraint if exists group_games_game_id_fkey,
  add constraint group_games_game_id_fkey
    foreign key (game_id) references public.games (id) on delete cascade;

commit;

select
  (select count(*) from information_schema.tables where table_schema = 'public') as tablo,
  (select count(*) from pg_policies where schemaname = 'public') as politika,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as fonksiyon,
  (select count(*) from storage.buckets where id = 'avatars') as avatar_bucket;
