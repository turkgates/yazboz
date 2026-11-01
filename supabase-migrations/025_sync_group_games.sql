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
