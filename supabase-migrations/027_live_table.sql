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
