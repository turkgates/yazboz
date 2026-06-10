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

create policy "Grup üyeleri grubu görür"
  on groups for select using (
    id in (select group_id from group_members where user_id = auth.uid())
  );

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
