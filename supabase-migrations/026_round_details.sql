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
