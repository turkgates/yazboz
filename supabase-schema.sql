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
