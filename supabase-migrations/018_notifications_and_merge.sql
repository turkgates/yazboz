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
