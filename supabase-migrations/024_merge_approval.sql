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
