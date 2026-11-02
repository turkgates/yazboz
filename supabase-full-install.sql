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

-- ═══════════════ 022_group_game_read_access.sql ═══════════════
-- Grup üyeleri, gruba bağlı oyunları ve ellerini okuyabilir. Grup davet koduyla
-- kurulduğu için üyeler genelde arkadaş değildir; bu olmadan herkes istatistiklerde
-- yalnızca kendi ve arkadaşlarının kaydettiği oyunları görüyordu.
--
-- Bu erişim yüzünden oyunu gruba yalnızca sahibi bağlayabilir: aksi halde bir kişi
-- kendi grubunu kurup başkasının oyununu ona bağlayarak okuyabilirdi.

-- Politikaların birbirine başvurup özyinelemeye girmemesi için security definer
create or replace function public.can_read_group_game(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_games gg
    join public.group_members gm on gm.group_id = gg.group_id
    where gg.game_id = p_game_id
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.owns_game(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.games
    where id = p_game_id and user_id = auth.uid()
  );
$$;

alter function public.can_read_group_game(uuid) owner to postgres;
alter function public.owns_game(uuid) owner to postgres;
revoke all on function public.can_read_group_game(uuid) from public, anon;
revoke all on function public.owns_game(uuid) from public, anon;
grant execute on function public.can_read_group_game(uuid) to authenticated;
grant execute on function public.owns_game(uuid) to authenticated;

drop policy if exists "Grup üyeleri grup oyununu okur" on public.games;
create policy "Grup üyeleri grup oyununu okur"
  on public.games for select
  to authenticated
  using (public.can_read_group_game(id));

drop policy if exists "Grup üyeleri grup oyununun ellerini okur" on public.rounds;
create policy "Grup üyeleri grup oyununun ellerini okur"
  on public.rounds for select
  to authenticated
  using (public.can_read_group_game(game_id));

drop policy if exists "Grup üyesi oyun ekleyebilir" on public.group_games;
create policy "Grup üyesi oyun ekleyebilir"
  on public.group_games for insert
  to authenticated
  with check (
    group_id in (select public.get_my_group_ids())
    and public.owns_game(game_id)
  );

-- ═══════════════ 023_social_notifications.sql ═══════════════
-- Grup katılma, ayrılma, çıkarma, grup silme ve arkadaşlıktan çıkarma bildirimleri.
-- Tetikleyiciyle sunucuda üretilir: katılma ve ayrılma hangi yoldan olursa olsun bildirim gider,
-- istemci metni veya alıcıyı seçemez.

-- ── Ortak yardımcılar (istemci çağıramaz) ─────────────────
create or replace function public.member_display_name(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(display_name), '') from public.profiles where id = p_user_id),
    'Bir üye'
  );
$$;

-- Aynı üye için aynı türde okunmamış bildirim varsa tekrar gönderilmez:
-- gruba girip çıkarak üyeler bildirime boğulamaz
create or replace function public.notify_group_members(
  p_group_id uuid,
  p_group_name text,
  p_member_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_skip uuid[]
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, data)
  select
    gm.user_id,
    p_type,
    p_title,
    p_body,
    jsonb_build_object(
      'group_id', p_group_id,
      'group_name', p_group_name,
      'member_id', p_member_id,
      'member_name', public.member_display_name(p_member_id),
      'actor_id', auth.uid()
    )
  from public.group_members gm
  where gm.group_id = p_group_id
    and not (gm.user_id = any (p_skip))
    and not exists (
      select 1 from public.notifications n
      where n.user_id = gm.user_id
        and n.type = p_type
        and n.is_read = false
        and n.data->>'group_id' = p_group_id::text
        and n.data->>'member_id' = p_member_id::text
    );
$$;

-- ── Gruba katılma ─────────────────────────────────────────
create or replace function public.on_group_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;

  perform public.notify_group_members(
    new.group_id,
    v_group_name,
    new.user_id,
    'group_joined',
    'Yeni Grup Üyesi',
    public.member_display_name(new.user_id) || ', ' || v_group_name || ' grubuna katıldı',
    array[new.user_id]
  );

  return new;
end;
$$;

drop trigger if exists notify_group_member_joined on public.group_members;
create trigger notify_group_member_joined
  after insert on public.group_members
  for each row execute function public.on_group_member_joined();

-- ── Gruptan ayrılma veya çıkarılma ────────────────────────
create or replace function public.on_group_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group_name text;
begin
  -- Grup silinirken üyeler de silinir; o durumda on_group_deleted bildirir
  select name into v_group_name from public.groups where id = old.group_id;
  if not found then
    return old;
  end if;

  if v_actor_id is null or v_actor_id = old.user_id then
    perform public.notify_group_members(
      old.group_id,
      v_group_name,
      old.user_id,
      'group_left',
      'Gruptan Ayrıldı',
      public.member_display_name(old.user_id) || ', ' || v_group_name || ' grubundan ayrıldı',
      array[old.user_id]
    );
    return old;
  end if;

  perform public.notify_group_members(
    old.group_id,
    v_group_name,
    old.user_id,
    'group_left',
    'Gruptan Çıkarıldı',
    public.member_display_name(old.user_id) || ', ' || v_group_name || ' grubundan çıkarıldı',
    array[old.user_id, v_actor_id]
  );

  insert into public.notifications (user_id, type, title, body, data)
  values (
    old.user_id,
    'group_removed',
    'Gruptan Çıkarıldın',
    v_group_name || ' grubundan çıkarıldın',
    jsonb_build_object('group_id', old.group_id, 'group_name', v_group_name, 'actor_id', v_actor_id)
  );

  return old;
end;
$$;

drop trigger if exists notify_group_member_left on public.group_members;
create trigger notify_group_member_left
  after delete on public.group_members
  for each row execute function public.on_group_member_left();

-- ── Grup silme ────────────────────────────────────────────
-- Üyeler henüz silinmeden çalışması için "before"
create or replace function public.on_group_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  insert into public.notifications (user_id, type, title, body, data)
  select
    gm.user_id,
    'group_deleted',
    'Grup Silindi',
    public.member_display_name(old.owner_id) || ', ' || old.name || ' grubunu sildi',
    jsonb_build_object('group_id', old.id, 'group_name', old.name, 'actor_id', v_actor_id)
  from public.group_members gm
  where gm.group_id = old.id
    and gm.user_id is distinct from v_actor_id;

  return old;
end;
$$;

drop trigger if exists notify_group_deleted on public.groups;
create trigger notify_group_deleted
  before delete on public.groups
  for each row execute function public.on_group_deleted();

-- ── Arkadaşlıktan çıkarma ─────────────────────────────────
-- Birleştirme kaydı da silinir: yeniden arkadaş olunca birleştirme sorusu tekrar gelsin
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
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

  delete from public.merge_requests
  where (requester_id = v_user_id and target_id = p_friend_id)
     or (requester_id = p_friend_id and target_id = v_user_id);

  update public.players
  set linked_user_id = null
  where (user_id = v_user_id and linked_user_id = p_friend_id)
     or (user_id = p_friend_id and linked_user_id = v_user_id);

  if not exists (
    select 1 from public.notifications
    where user_id = p_friend_id
      and type = 'friend_removed'
      and is_read = false
      and data->>'actor_id' = v_user_id::text
  ) then
    v_name := public.member_display_name(v_user_id);
    insert into public.notifications (user_id, type, title, body, data)
    values (
      p_friend_id,
      'friend_removed',
      'Arkadaşlık Sona Erdi',
      v_name || ' seni arkadaş listesinden çıkardı',
      jsonb_build_object('actor_id', v_user_id, 'friend_name', v_name)
    );
  end if;
end;
$$;

-- ── Yetkiler ──────────────────────────────────────────────
alter function public.member_display_name(uuid) owner to postgres;
alter function public.notify_group_members(uuid, text, uuid, text, text, text, uuid[]) owner to postgres;
alter function public.on_group_member_joined() owner to postgres;
alter function public.on_group_member_left() owner to postgres;
alter function public.on_group_deleted() owner to postgres;
alter function public.remove_friend(uuid) owner to postgres;

revoke all on function public.member_display_name(uuid) from public, anon, authenticated;
revoke all on function public.notify_group_members(uuid, text, uuid, text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.on_group_member_joined() from public, anon, authenticated;
revoke all on function public.on_group_member_left() from public, anon, authenticated;
revoke all on function public.on_group_deleted() from public, anon, authenticated;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ═══════════════ 024_merge_approval.sql ═══════════════
-- Yerel oyuncu birleştirme artık karşı tarafın onayıyla tamamlanır.
-- İstek yapan yalnızca onaya gönderir; onaylayan istek yapanın oyunlarını değiştiremeyeceği
-- için ad değişikliği burada, sunucuda ve tek işlemde yapılır.

alter table public.merge_requests add column if not exists local_player_name text;
alter table public.merge_requests add column if not exists responded_at timestamptz;

-- Durum yalnızca fonksiyonlarla değişir; istemci sadece "birleştirme yapma" kararını yazar
drop policy if exists "merge_requests_insert" on public.merge_requests;
drop policy if exists "merge_requests_update" on public.merge_requests;
drop policy if exists "merge_requests_skip_insert" on public.merge_requests;
drop policy if exists "merge_requests_skip_update" on public.merge_requests;

create policy "merge_requests_skip_insert"
  on public.merge_requests for insert
  to authenticated
  with check (requester_id = auth.uid() and status = 'skipped');

create policy "merge_requests_skip_update"
  on public.merge_requests for update
  to authenticated
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid() and status = 'skipped');

-- Kişi, başkasının kendisine bağladığı oyuncu kaydını görür: istatistiğine hangi
-- arkadaşının oyunlarının sayılacağı buradan anlaşılır
drop policy if exists "Bana bağlı oyuncu kayıtlarını görür" on public.players;
create policy "Bana bağlı oyuncu kayıtlarını görür"
  on public.players for select
  to authenticated
  using (linked_user_id = auth.uid());

-- ── Arkadaşı oyuncu listesine ekleme ──────────────────────
-- Aynı adlı yerel oyuncu varsa eklenmez: oyunlar isimle eşleştiği için o yerel oyuncunun
-- oyunları onaysız olarak arkadaşın istatistiğine geçerdi
create or replace function public.ensure_friend_player(p_owner_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
begin
  select display_name, avatar_url into v_name, v_avatar
  from public.profiles where id = p_friend_id;

  if nullif(trim(v_name), '') is null then
    return;
  end if;

  if exists (
    select 1 from public.players
    where user_id = p_owner_id
      and (linked_user_id = p_friend_id or lower(name) = lower(v_name))
  ) then
    return;
  end if;

  insert into public.players (user_id, name, avatar_url, linked_user_id)
  values (p_owner_id, v_name, v_avatar, p_friend_id);
end;
$$;

-- ── Bir oyunda oyuncu adını değiştirme ────────────────────
-- Dönüş: 'renamed', 'skipped' (iki isim de aynı masada) veya 'none' (oyuncu bu oyunda yok)
create or replace function public.merge_rename_game(p_game_id uuid, p_old text, p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_old text;
  v_map jsonb;
  v_teams jsonb;
  v_team jsonb;
  v_label text;
  v_new_label text;
begin
  select * into g from public.games where id = p_game_id for update;

  select p into v_old
  from jsonb_array_elements_text(g.players) as p
  where lower(p) = lower(p_old)
  limit 1;

  if v_old is null then
    return 'none';
  end if;

  -- Aynı masada iki farklı kişi: birleştirmek skorlardan birini ezerdi
  if lower(p_old) <> lower(p_new) and exists (
    select 1 from jsonb_array_elements_text(g.players) as p
    where lower(p) = lower(p_new)
  ) then
    return 'skipped';
  end if;

  if v_old = p_new then
    return 'renamed';
  end if;

  v_map := jsonb_build_object(v_old, p_new);

  -- Eşli oyunlarda skor ve banko kayıtları "A & B" etiketiyle tutulur
  v_teams := case
    when jsonb_typeof(g.teams) = 'array' and jsonb_array_length(g.teams) > 0 then g.teams
    when (g.game_type = 'cezali_esli' or g.game_subtype = 'esli') and jsonb_array_length(g.players) = 4 then
      jsonb_build_array(
        jsonb_build_array(g.players->0, g.players->1),
        jsonb_build_array(g.players->2, g.players->3)
      )
    else '[]'::jsonb
  end;

  for v_team in select * from jsonb_array_elements(v_teams) loop
    if v_team ? v_old then
      select
        string_agg(m, ' & ' order by o),
        string_agg(case when m = v_old then p_new else m end, ' & ' order by o)
      into v_label, v_new_label
      from jsonb_array_elements_text(v_team) with ordinality as x(m, o);

      v_map := v_map || jsonb_build_object(v_label, v_new_label);
    end if;
  end loop;

  update public.games
  set
    players = (
      select jsonb_agg(coalesce(v_map->>p, p) order by o)
      from jsonb_array_elements_text(g.players) with ordinality as a(p, o)
    ),
    teams = case
      when jsonb_typeof(g.teams) = 'array' then (
        select coalesce(
          jsonb_agg(
            (
              select jsonb_agg(coalesce(v_map->>m, m) order by o2)
              from jsonb_array_elements_text(team) with ordinality as b(m, o2)
            )
            order by o1
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(g.teams) with ordinality as c(team, o1)
      )
      else g.teams
    end,
    banko_history = case
      when jsonb_typeof(g.banko_history) = 'object' then (
        select coalesce(jsonb_object_agg(coalesce(v_map->>k, k), v), '{}'::jsonb)
        from jsonb_each(g.banko_history) as e(k, v)
      )
      else g.banko_history
    end
  where id = g.id;

  update public.rounds r
  set
    scores = (
      select coalesce(jsonb_object_agg(coalesce(v_map->>k, k), v), '{}'::jsonb)
      from jsonb_each(r.scores) as e(k, v)
    ),
    indicator_players = case
      when jsonb_typeof(r.indicator_players) = 'array' then (
        select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
        from jsonb_array_elements_text(r.indicator_players) with ordinality as a(p, o)
      )
      else r.indicator_players
    end,
    banko_players = case
      when jsonb_typeof(r.banko_players) = 'array' then (
        select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
        from jsonb_array_elements_text(r.banko_players) with ordinality as a(p, o)
      )
      else r.banko_players
    end
  where r.game_id = g.id;

  return 'renamed';
end;
$$;

-- ── Birleştirme isteği ────────────────────────────────────
create or replace function public.request_player_merge(p_local_player_id uuid, p_target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_name text;
  v_request_id uuid;
  v_name text;
  v_games integer;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if not exists (
    select 1 from public.friends
    where user_id = v_user_id and friend_id = p_target_id
  ) then
    raise exception 'Yalnızca arkadaşınla birleştirme yapabilirsin';
  end if;

  select name into v_player_name
  from public.players
  where id = p_local_player_id
    and user_id = v_user_id
    and linked_user_id is null;

  if v_player_name is null then
    raise exception 'Yerel oyuncu bulunamadı';
  end if;

  insert into public.merge_requests (requester_id, target_id, local_player_id, local_player_name, status)
  values (v_user_id, p_target_id, p_local_player_id, v_player_name, 'pending')
  on conflict (requester_id, target_id) do update
  set
    local_player_id = excluded.local_player_id,
    local_player_name = excluded.local_player_name,
    status = 'pending',
    responded_at = null,
    created_at = now()
  returning id into v_request_id;

  -- Onay beklerken yeni oyunlarda arkadaş seçilebilsin
  perform public.ensure_friend_player(v_user_id, p_target_id);

  select count(*) into v_games
  from public.games g
  where g.user_id = v_user_id
    and g.status = 'finished'
    and exists (
      select 1 from jsonb_array_elements_text(g.players) as p
      where lower(p) = lower(v_player_name)
    );

  select coalesce(nullif(trim(display_name), ''), 'Birisi') into v_name
  from public.profiles where id = v_user_id;

  -- İstek değiştiyse eski bildirim yanıltmasın
  delete from public.notifications
  where user_id = p_target_id
    and type = 'merge_request'
    and data->>'request_id' = v_request_id::text;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_target_id,
    'merge_request',
    'Birleştirme Onayı',
    v_name || ', kayıtlarındaki "' || v_player_name || '" oyuncusunu seninle birleştirmek istiyor (' || v_games || ' oyun)',
    jsonb_build_object(
      'request_id', v_request_id,
      'requester_id', v_user_id,
      'requester_name', v_name,
      'local_player_name', v_player_name,
      'actor_id', v_user_id
    )
  );

  return v_request_id;
end;
$$;

-- ── Onay veya ret ─────────────────────────────────────────
create or replace function public.respond_player_merge(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.merge_requests%rowtype;
  v_name text;
  v_avatar text;
  v_game record;
  v_result text;
  v_merged integer := 0;
  v_skipped integer := 0;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_req
  from public.merge_requests
  where id = p_request_id
    and target_id = v_user_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'İstek bulunamadı veya zaten yanıtlandı';
  end if;

  select display_name, avatar_url into v_name, v_avatar
  from public.profiles where id = v_user_id;
  v_name := nullif(trim(v_name), '');

  update public.notifications
  set is_read = true
  where user_id = v_user_id
    and type = 'merge_request'
    and data->>'request_id' = p_request_id::text;

  if not p_accept then
    update public.merge_requests
    set status = 'rejected', responded_at = now()
    where id = p_request_id;

    perform public.ensure_friend_player(v_req.requester_id, v_user_id);

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_req.requester_id,
      'merge_rejected',
      'Birleştirme Reddedildi',
      coalesce(v_name, 'Arkadaşın') || ', "' || v_req.local_player_name || '" oyuncusuyla birleştirmeyi reddetti',
      jsonb_build_object(
        'friend_id', v_user_id,
        'friend_name', v_name,
        'local_player_name', v_req.local_player_name,
        'actor_id', v_user_id
      )
    );

    return jsonb_build_object('accepted', false);
  end if;

  if v_name is null then
    raise exception 'Önce profil adını ayarla';
  end if;

  for v_game in select id from public.games where user_id = v_req.requester_id loop
    v_result := public.merge_rename_game(v_game.id, v_req.local_player_name, v_name);
    if v_result = 'renamed' then
      v_merged := v_merged + 1;
    elsif v_result = 'skipped' then
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  -- Atlanan oyunlarda eski ad durduğu için yerel kayıt da durur
  if v_skipped > 0 then
    perform public.ensure_friend_player(v_req.requester_id, v_user_id);

    update public.players
    set name = v_name, avatar_url = v_avatar
    where user_id = v_req.requester_id and linked_user_id = v_user_id;

  -- Arkadaş için bağlı kayıt zaten varsa yerel kayıt ona katılır
  elsif exists (
    select 1 from public.players
    where user_id = v_req.requester_id
      and linked_user_id = v_user_id
      and id is distinct from v_req.local_player_id
  ) then
    delete from public.players
    where id = v_req.local_player_id and user_id = v_req.requester_id;

    update public.players
    set name = v_name, avatar_url = v_avatar
    where user_id = v_req.requester_id and linked_user_id = v_user_id;
  else
    update public.players
    set name = v_name, avatar_url = v_avatar, linked_user_id = v_user_id
    where id = v_req.local_player_id and user_id = v_req.requester_id;

    if not found then
      insert into public.players (user_id, name, avatar_url, linked_user_id)
      values (v_req.requester_id, v_name, v_avatar, v_user_id);
    end if;
  end if;

  update public.merge_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_req.requester_id,
    'merge_approved',
    'Birleştirme Onaylandı',
    v_name || ', "' || v_req.local_player_name || '" oyuncusuyla birleştirmeyi onayladı (' || v_merged || ' oyun)',
    jsonb_build_object(
      'friend_id', v_user_id,
      'friend_name', v_name,
      'local_player_name', v_req.local_player_name,
      'merged_games', v_merged,
      'skipped_games', v_skipped,
      'actor_id', v_user_id
    )
  );

  return jsonb_build_object('accepted', true, 'merged_games', v_merged, 'skipped_games', v_skipped);
end;
$$;

-- ── Yetkiler ──────────────────────────────────────────────
alter function public.ensure_friend_player(uuid, uuid) owner to postgres;
alter function public.merge_rename_game(uuid, text, text) owner to postgres;
alter function public.request_player_merge(uuid, uuid) owner to postgres;
alter function public.respond_player_merge(uuid, boolean) owner to postgres;

revoke all on function public.ensure_friend_player(uuid, uuid) from public, anon, authenticated;
revoke all on function public.merge_rename_game(uuid, text, text) from public, anon, authenticated;

revoke all on function public.request_player_merge(uuid, uuid) from public, anon;
revoke all on function public.respond_player_merge(uuid, boolean) from public, anon;
grant execute on function public.request_player_merge(uuid, uuid) to authenticated;
grant execute on function public.respond_player_merge(uuid, boolean) to authenticated;

-- ═══════════════ 025_sync_group_games.sql ═══════════════
-- Grup üyelerinden en az ikisinin oynadığı bitmiş oyunları gruba bağlar.
-- Bağlantı önceden yalnızca oyun biterken, kaydedenin telefonunda kuruluyordu: üye sonradan
-- katılınca veya oyuncu birleştirilince o oyunlar grup istatistiğinin dışında kalıyordu.
--
-- Yalnızca mevcut üyelerin kendi kaydettiği oyunlar bağlanır: gruba katılmamış birinin oyunu
-- grup üzerinden okunamaz.
create or replace function public.sync_group_games(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_names text[];
  v_linked integer;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user_id
  ) then
    raise exception 'Bu grubun üyesi değilsin';
  end if;

  select array_agg(lower(trim(p.display_name))) into v_names
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and nullif(trim(p.display_name), '') is not null;

  insert into public.group_games (group_id, game_id)
  select p_group_id, g.id
  from public.games g
  where g.status = 'finished'
    and g.user_id in (
      select user_id from public.group_members where group_id = p_group_id
    )
    and (
      select count(*)
      from jsonb_array_elements_text(g.players) as n
      where lower(trim(n)) = any (v_names)
    ) >= 2
  on conflict (group_id, game_id) do nothing;

  get diagnostics v_linked = row_count;
  return v_linked;
end;
$$;

alter function public.sync_group_games(uuid) owner to postgres;
revoke all on function public.sync_group_games(uuid) from public, anon;
grant execute on function public.sync_group_games(uuid) to authenticated;

-- ═══════════════ 026_round_details.sql ═══════════════
-- Elin ham girişi (kim bitti, kim yaktı, elindeki puan) puanla birlikte saklanır.
-- Şimdiye kadar yalnızca hesaplanmış puan tutuluyordu: yakma ve düzenleme puandan tahmin
-- ediliyordu, aynı puanı alan oyuncu yanlışlıkla "yaktı" sayılabiliyordu.
alter table public.rounds add column if not exists details jsonb;

-- Oyuncu adı değişince ham girişteki adlar da taşınır
create or replace function public.merge_rename_game(p_game_id uuid, p_old text, p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_old text;
  v_map jsonb;
  v_teams jsonb;
  v_team jsonb;
  v_label text;
  v_new_label text;
begin
  select * into g from public.games where id = p_game_id for update;

  select p into v_old
  from jsonb_array_elements_text(g.players) as p
  where lower(p) = lower(p_old)
  limit 1;

  if v_old is null then
    return 'none';
  end if;

  -- Aynı masada iki farklı kişi: birleştirmek skorlardan birini ezerdi
  if lower(p_old) <> lower(p_new) and exists (
    select 1 from jsonb_array_elements_text(g.players) as p
    where lower(p) = lower(p_new)
  ) then
    return 'skipped';
  end if;

  if v_old = p_new then
    return 'renamed';
  end if;

  v_map := jsonb_build_object(v_old, p_new);

  -- Eşli oyunlarda skor ve banko kayıtları "A & B" etiketiyle tutulur
  v_teams := case
    when jsonb_typeof(g.teams) = 'array' and jsonb_array_length(g.teams) > 0 then g.teams
    when (g.game_type = 'cezali_esli' or g.game_subtype = 'esli') and jsonb_array_length(g.players) = 4 then
      jsonb_build_array(
        jsonb_build_array(g.players->0, g.players->1),
        jsonb_build_array(g.players->2, g.players->3)
      )
    else '[]'::jsonb
  end;

  for v_team in select * from jsonb_array_elements(v_teams) loop
    if v_team ? v_old then
      select
        string_agg(m, ' & ' order by o),
        string_agg(case when m = v_old then p_new else m end, ' & ' order by o)
      into v_label, v_new_label
      from jsonb_array_elements_text(v_team) with ordinality as x(m, o);

      v_map := v_map || jsonb_build_object(v_label, v_new_label);
    end if;
  end loop;

  update public.games
  set
    players = (
      select jsonb_agg(coalesce(v_map->>p, p) order by o)
      from jsonb_array_elements_text(g.players) with ordinality as a(p, o)
    ),
    teams = case
      when jsonb_typeof(g.teams) = 'array' then (
        select coalesce(
          jsonb_agg(
            (
              select jsonb_agg(coalesce(v_map->>m, m) order by o2)
              from jsonb_array_elements_text(team) with ordinality as b(m, o2)
            )
            order by o1
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(g.teams) with ordinality as c(team, o1)
      )
      else g.teams
    end,
    banko_history = case
      when jsonb_typeof(g.banko_history) = 'object' then (
        select coalesce(jsonb_object_agg(coalesce(v_map->>k, k), v), '{}'::jsonb)
        from jsonb_each(g.banko_history) as e(k, v)
      )
      else g.banko_history
    end
  where id = g.id;

  update public.rounds r
  set
    scores = (
      select coalesce(jsonb_object_agg(coalesce(v_map->>k, k), v), '{}'::jsonb)
      from jsonb_each(r.scores) as e(k, v)
    ),
    indicator_players = case
      when jsonb_typeof(r.indicator_players) = 'array' then (
        select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
        from jsonb_array_elements_text(r.indicator_players) with ordinality as a(p, o)
      )
      else r.indicator_players
    end,
    banko_players = case
      when jsonb_typeof(r.banko_players) = 'array' then (
        select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
        from jsonb_array_elements_text(r.banko_players) with ordinality as a(p, o)
      )
      else r.banko_players
    end,
    details = case
      when jsonb_typeof(r.details->'players') = 'object' then jsonb_set(
        r.details,
        '{players}',
        (
          select coalesce(jsonb_object_agg(coalesce(v_map->>k, k), v), '{}'::jsonb)
          from jsonb_each(r.details->'players') as e(k, v)
        )
      )
      else r.details
    end
  where r.game_id = g.id;

  return 'renamed';
end;
$$;

alter function public.merge_rename_game(uuid, text, text) owner to postgres;
revoke all on function public.merge_rename_game(uuid, text, text) from public, anon, authenticated;

-- ═══════════════ 027_live_table.sql ═══════════════
-- Canlı masa: masadakiler kodla oyuna katılır, skoru kendi telefonundan anlık izler ve
-- hangi oyuncu olduğunu seçer. Oyun bitince koltuğu alan kişinin adı oyuna işlenir, oyun onun
-- istatistiğine yazılır: isimle eşleştirme ve birleştirme isteği gerekmez.
alter table public.games add column if not exists live_code text;
alter table public.games add column if not exists live_updated_at timestamptz;

create unique index if not exists games_live_code_key
  on public.games (live_code)
  where live_code is not null;

create table if not exists public.game_participants (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  player_name text,
  joined_at   timestamptz not null default now(),
  unique (game_id, user_id)
);

create unique index if not exists game_participants_seat_key
  on public.game_participants (game_id, lower(player_name))
  where player_name is not null;

create index if not exists game_participants_user_idx
  on public.game_participants (user_id);

alter table public.game_participants enable row level security;

-- Politikaların birbirine başvurup özyinelemeye girmemesi için security definer
create or replace function public.is_game_participant(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.game_participants
    where game_id = p_game_id and user_id = auth.uid()
  );
$$;

drop policy if exists "Masadakileri görür" on public.game_participants;
create policy "Masadakileri görür"
  on public.game_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.owns_game(game_id)
    or public.is_game_participant(game_id)
  );

drop policy if exists "Masadan ayrılır veya çıkarır" on public.game_participants;
create policy "Masadan ayrılır veya çıkarır"
  on public.game_participants for delete
  to authenticated
  using (user_id = auth.uid() or public.owns_game(game_id));

-- Katılma ve koltuk seçimi yalnızca doğrulama yapan fonksiyonlarla olur
revoke all on public.game_participants from anon;
revoke insert, update on public.game_participants from authenticated;
grant select, delete on public.game_participants to authenticated;

drop policy if exists "Masadaki oyunu okur" on public.games;
create policy "Masadaki oyunu okur"
  on public.games for select
  to authenticated
  using (public.is_game_participant(id));

drop policy if exists "Masadaki oyunun ellerini okur" on public.rounds;
create policy "Masadaki oyunun ellerini okur"
  on public.rounds for select
  to authenticated
  using (public.is_game_participant(game_id));

-- ── Anlık bildirim ────────────────────────────────────────
-- İzleyiciler oyun satırını dinler. El eklenince, değişince veya silinince satır değişir;
-- silme olayları süzülemediği için elleri dinlemek yerine bu yol seçildi.
create or replace function public.touch_live_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
begin
  update public.games
  set live_updated_at = now()
  where id = v_game_id and live_code is not null;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists touch_live_game on public.rounds;
create trigger touch_live_game
  after insert or update or delete on public.rounds
  for each row execute function public.touch_live_game();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- ── Koltuk kuralı ─────────────────────────────────────────
-- Masayı yazanın koltuğu ve arkadaşına bağlı koltuk başkasına verilmez
create or replace function public.live_seat_reserved(p_game public.games, p_seat text, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles
      where id = p_game.user_id and lower(trim(display_name)) = lower(trim(p_seat))
    )
    or exists (
      select 1 from public.players
      where user_id = p_game.user_id
        and lower(name) = lower(p_seat)
        and linked_user_id is not null
        and linked_user_id <> p_user_id
    );
$$;

-- ── Masayı açma ───────────────────────────────────────────
create or replace function public.open_live_table(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_code text;
  v_name text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_game
  from public.games
  where id = p_game_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Oyun bulunamadı';
  end if;

  if v_game.status <> 'active' then
    raise exception 'Bu oyun bitti';
  end if;

  if v_game.live_code is not null then
    return v_game.live_code;
  end if;

  loop
    select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
    into v_code
    from generate_series(1, 6);

    exit when not exists (select 1 from public.games where live_code = v_code);
  end loop;

  update public.games
  set live_code = v_code, live_updated_at = now()
  where id = p_game_id;

  select coalesce(nullif(trim(display_name), ''), 'Arkadaşın') into v_name
  from public.profiles where id = v_user_id;

  -- Oyunda seçilmiş arkadaşlar kod beklemeden haberdar olur
  insert into public.notifications (user_id, type, title, body, data)
  select distinct
    pl.linked_user_id,
    'live_invite',
    'Canlı Masa',
    v_name || ' seni masaya ekledi. Skoru canlı izleyebilirsin.',
    jsonb_build_object('game_id', p_game_id, 'live_code', v_code, 'actor_id', v_user_id)
  from public.players pl
  join public.friends f on f.user_id = v_user_id and f.friend_id = pl.linked_user_id
  where pl.user_id = v_user_id
    and exists (
      select 1 from jsonb_array_elements_text(v_game.players) as n
      where lower(n) = lower(pl.name)
    );

  return v_code;
end;
$$;

-- ── Masaya katılma ────────────────────────────────────────
create or replace function public.join_live_table(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_name text;
  v_seat text;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_game
  from public.games
  where live_code = upper(trim(p_code));

  if not found then
    raise exception 'Geçersiz masa kodu';
  end if;

  if v_game.user_id = v_user_id then
    return jsonb_build_object('game_id', v_game.id, 'is_owner', true);
  end if;

  select player_name into v_seat
  from public.game_participants
  where game_id = v_game.id and user_id = v_user_id;

  if found then
    return jsonb_build_object('game_id', v_game.id, 'player_name', v_seat);
  end if;

  if v_game.status <> 'active' then
    raise exception 'Bu masa kapandı';
  end if;

  if (select count(*) from public.game_participants where game_id = v_game.id) >= 20 then
    raise exception 'Masa dolu';
  end if;

  select nullif(trim(display_name), '') into v_name
  from public.profiles where id = v_user_id;

  -- Kendi adıyla boş koltuk varsa sormaya gerek yok
  select n into v_seat
  from jsonb_array_elements_text(v_game.players) as n
  where lower(n) = lower(v_name)
    and not public.live_seat_reserved(v_game, n, v_user_id)
    and not exists (
      select 1 from public.game_participants gp
      where gp.game_id = v_game.id and lower(gp.player_name) = lower(n)
    )
  limit 1;

  insert into public.game_participants (game_id, user_id, player_name)
  values (v_game.id, v_user_id, v_seat)
  on conflict (game_id, user_id) do nothing;

  return jsonb_build_object('game_id', v_game.id, 'player_name', v_seat);
end;
$$;

-- ── Koltuk seçme ──────────────────────────────────────────
create or replace function public.claim_live_seat(p_game_id uuid, p_player_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_name text;
  v_seat text;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if not exists (
    select 1 from public.game_participants
    where game_id = p_game_id and user_id = v_user_id
  ) then
    raise exception 'Önce masaya katıl';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.status <> 'active' then
    raise exception 'Bu masa kapandı';
  end if;

  if p_player_name is null then
    update public.game_participants
    set player_name = null
    where game_id = p_game_id and user_id = v_user_id;
    return null;
  end if;

  select n into v_seat
  from jsonb_array_elements_text(v_game.players) as n
  where lower(n) = lower(trim(p_player_name))
  limit 1;

  if v_seat is null then
    raise exception 'Bu oyuncu masada yok';
  end if;

  if public.live_seat_reserved(v_game, v_seat, v_user_id) then
    raise exception 'Bu koltuk başka birine ayrılmış';
  end if;

  select nullif(trim(display_name), '') into v_name
  from public.profiles where id = v_user_id;

  -- Oyun bitince koltuk bu kişinin adını alacak: aynı adda başka oyuncu varsa skorlar karışırdı
  if lower(v_name) <> lower(v_seat) and exists (
    select 1 from jsonb_array_elements_text(v_game.players) as n
    where lower(n) = lower(v_name)
  ) then
    raise exception 'Bu masada senin adınla başka bir oyuncu var';
  end if;

  begin
    update public.game_participants
    set player_name = v_seat
    where game_id = p_game_id and user_id = v_user_id;
  exception when unique_violation then
    raise exception 'Bu koltuk dolu';
  end;

  return v_seat;
end;
$$;

-- Oyuncu adı oyun sırasında ayarlardan değişirse koltuk da onu izler
create or replace function public.follow_seat_renames()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
begin
  for i in 0 .. least(jsonb_array_length(old.players), jsonb_array_length(new.players)) - 1 loop
    if old.players->>i is distinct from new.players->>i then
      begin
        update public.game_participants
        set player_name = new.players->>i
        where game_id = new.id and player_name = old.players->>i;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists follow_seat_renames on public.games;
create trigger follow_seat_renames
  after update of players on public.games
  for each row
  when (old.players is distinct from new.players)
  execute function public.follow_seat_renames();

-- ── Oyun bitince ──────────────────────────────────────────
create or replace function public.finish_live_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_name text;
  v_owner text;
begin
  for s in
    select id, user_id, player_name
    from public.game_participants
    where game_id = new.id and player_name is not null
  loop
    select nullif(trim(display_name), '') into v_name
    from public.profiles where id = s.user_id;

    if v_name is not null
      and public.merge_rename_game(new.id, s.player_name, v_name) = 'renamed'
    then
      update public.game_participants set player_name = v_name where id = s.id;
    end if;
  end loop;

  select coalesce(nullif(trim(display_name), ''), 'Arkadaşın') into v_owner
  from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    gp.user_id,
    'live_finished',
    'Oyun Bitti',
    case
      when gp.player_name is null then v_owner || ' masasındaki oyun bitti'
      else v_owner || ' masasındaki oyun bitti, istatistiklerine eklendi'
    end,
    jsonb_build_object('game_id', new.id, 'actor_id', new.user_id)
  from public.game_participants gp
  where gp.game_id = new.id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = gp.user_id
        and n.type = 'live_finished'
        and n.data->>'game_id' = new.id::text
    );

  return new;
end;
$$;

drop trigger if exists finish_live_table on public.games;
create trigger finish_live_table
  after update of status on public.games
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.finish_live_table();

-- ── Yetkiler ──────────────────────────────────────────────
alter function public.is_game_participant(uuid) owner to postgres;
alter function public.touch_live_game() owner to postgres;
alter function public.live_seat_reserved(public.games, text, uuid) owner to postgres;
alter function public.open_live_table(uuid) owner to postgres;
alter function public.join_live_table(text) owner to postgres;
alter function public.claim_live_seat(uuid, text) owner to postgres;
alter function public.follow_seat_renames() owner to postgres;
alter function public.finish_live_table() owner to postgres;

revoke all on function public.touch_live_game() from public, anon, authenticated;
revoke all on function public.live_seat_reserved(public.games, text, uuid) from public, anon, authenticated;
revoke all on function public.follow_seat_renames() from public, anon, authenticated;
revoke all on function public.finish_live_table() from public, anon, authenticated;

revoke all on function public.is_game_participant(uuid) from public, anon;
revoke all on function public.open_live_table(uuid) from public, anon;
revoke all on function public.join_live_table(text) from public, anon;
revoke all on function public.claim_live_seat(uuid, text) from public, anon;
grant execute on function public.is_game_participant(uuid) to authenticated;
grant execute on function public.open_live_table(uuid) to authenticated;
grant execute on function public.join_live_table(text) to authenticated;
grant execute on function public.claim_live_seat(uuid, text) to authenticated;

commit;

select
  (select count(*) from information_schema.tables where table_schema = 'public') as tablo,
  (select count(*) from pg_policies where schemaname = 'public') as politika,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as fonksiyon,
  (select count(*) from storage.buckets where id = 'avatars') as avatar_bucket;
