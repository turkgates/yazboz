-- profiles: username, display_name, avatar_url, bio
alter table profiles 
  add column if not exists username text unique,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

create unique index if not exists 
  profiles_username_idx on profiles(username);

-- players: link to auth user
alter table players 
  add column if not exists linked_user_id uuid 
    references auth.users;

-- games: who recorded the game
alter table games 
  add column if not exists recorded_by uuid 
    references auth.users;

-- groups
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users not null,
  invite_code text unique not null,
  created_at timestamptz default now()
);

alter table groups enable row level security;

-- group members
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups not null,
  user_id uuid references auth.users not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_members enable row level security;

-- group games
create table if not exists group_games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups not null,
  game_id uuid references games not null,
  created_at timestamptz default now(),
  unique(group_id, game_id)
);

alter table group_games enable row level security;

-- friend requests
create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users not null,
  receiver_id uuid references auth.users not null,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(sender_id, receiver_id)
);

alter table friend_requests enable row level security;

-- friends
create table if not exists friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  friend_id uuid references auth.users not null,
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

alter table friends enable row level security;
