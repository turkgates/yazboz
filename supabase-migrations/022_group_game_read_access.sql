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
