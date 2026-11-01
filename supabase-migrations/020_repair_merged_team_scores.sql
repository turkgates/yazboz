-- Birleştirme hatasının bozduğu eşli oyunları onarır.
-- Hata: oyuncu birleştirilince takım adı değişiyor, ama skorlar eski
-- "Eski Ad & Takım Arkadaşı" anahtarında kalıyordu; takım toplamı 0 görünüyordu.
--
-- Yalnızca güncel takım etiketi eksik ve eski etiketi kesin eşleşen kayıtlara dokunur.
-- Değişen satırların eski hali rounds_backup_020 ve games_backup_020 tablolarında kalır.
-- Tekrar çalıştırmak güvenlidir. Sonuçları kontrol ettikten sonra yedekleri silebilirsiniz.

begin;

create table if not exists public.rounds_backup_020 (like public.rounds);
create table if not exists public.games_backup_020 (id uuid primary key, banko_history jsonb);

-- Politika yok: yedekler API'den okunamaz
alter table public.rounds_backup_020 enable row level security;
alter table public.games_backup_020 enable row level security;
revoke all on public.rounds_backup_020 from anon, authenticated;
revoke all on public.games_backup_020 from anon, authenticated;

create function public.repair_020_label_map(p_labels text[], p_known text[], p_keys text[])
returns jsonb
language plpgsql
immutable
as $$
declare
  v_missing text[] := array(select l from unnest(p_labels) l where l <> all(p_keys));
  v_orphans text[] := array(
    select k from unnest(p_keys) k where k <> all(p_known) and k like '% & %'
  );
  v_map jsonb := '{}';
  v_label text;
  v_candidates text[];
begin
  if cardinality(v_missing) = 0 or cardinality(v_orphans) = 0 then
    return v_map;
  end if;

  -- Takımda adı değişmeyen oyuncu üzerinden eşleştir
  foreach v_label in array v_missing loop
    v_candidates := array(
      select o from unnest(v_orphans) o
      where string_to_array(o, ' & ') && string_to_array(v_label, ' & ')
    );
    if cardinality(v_candidates) = 1 then
      v_map := v_map || jsonb_build_object(v_candidates[1], v_label);
    end if;
  end loop;

  -- Ortak oyuncu yoksa yalnızca tek eksik + tek eski etiket kesin eşleşme sayılır
  v_missing := array(
    select l from unnest(v_missing) l
    where not exists (select 1 from jsonb_each_text(v_map) m where m.value = l)
  );
  v_orphans := array(select o from unnest(v_orphans) o where not v_map ? o);

  if cardinality(v_missing) = 1 and cardinality(v_orphans) = 1 then
    v_map := v_map || jsonb_build_object(v_orphans[1], v_missing[1]);
  end if;

  return v_map;
end;
$$;

do $$
declare
  g record;
  r public.rounds%rowtype;
  v_teams jsonb;
  v_labels text[];
  v_known text[];
  v_map jsonb;
begin
  for g in
    select id, players, teams, banko_history
    from public.games
    where case
      when jsonb_typeof(teams) = 'array' then jsonb_array_length(teams) > 0
      else false
    end
    or ((game_type = 'cezali_esli' or game_subtype = 'esli') and jsonb_array_length(players) = 4)
  loop
    v_teams := case
      when jsonb_typeof(g.teams) = 'array' and jsonb_array_length(g.teams) > 0 then g.teams
      else jsonb_build_array(
        jsonb_build_array(g.players->0, g.players->1),
        jsonb_build_array(g.players->2, g.players->3)
      )
    end;

    v_labels := array(
      select (
        select string_agg(m, ' & ' order by o)
        from jsonb_array_elements_text(t) with ordinality as x(m, o)
      )
      from jsonb_array_elements(v_teams) as t
    );
    v_known := v_labels || array(select jsonb_array_elements_text(g.players));

    for r in select * from public.rounds where game_id = g.id loop
      v_map := public.repair_020_label_map(
        v_labels,
        v_known,
        array(select jsonb_object_keys(r.scores))
      );
      continue when v_map = '{}'::jsonb;

      insert into public.rounds_backup_020 select r.*;

      update public.rounds
      set
        scores = (
          select jsonb_object_agg(coalesce(v_map->>k, k), v)
          from jsonb_each(r.scores) as e(k, v)
        ),
        indicator_players = case
          when r.indicator_players is null then null
          else (
            select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
            from jsonb_array_elements_text(r.indicator_players) with ordinality as a(p, o)
          )
        end,
        banko_players = case
          when r.banko_players is null then null
          else (
            select coalesce(jsonb_agg(coalesce(v_map->>p, p) order by o), '[]'::jsonb)
            from jsonb_array_elements_text(r.banko_players) with ordinality as a(p, o)
          )
        end
      where id = r.id;
    end loop;

    if jsonb_typeof(g.banko_history) = 'object' then
      v_map := public.repair_020_label_map(
        v_labels,
        v_known,
        array(select jsonb_object_keys(g.banko_history))
      );
      if v_map <> '{}'::jsonb then
        insert into public.games_backup_020 (id, banko_history)
        values (g.id, g.banko_history)
        on conflict (id) do nothing;

        update public.games
        set banko_history = (
          select jsonb_object_agg(coalesce(v_map->>k, k), v)
          from jsonb_each(g.banko_history) as e(k, v)
        )
        where id = g.id;
      end if;
    end if;
  end loop;
end $$;

drop function public.repair_020_label_map(text[], text[], text[]);

commit;

select
  (select count(*) from public.rounds_backup_020) as onarilan_el,
  (select count(*) from public.games_backup_020) as onarilan_banko_gecmisi;
