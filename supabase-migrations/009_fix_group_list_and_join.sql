-- Fix group list + join by invite code

-- Users can always read their own membership rows (fixes list fetch)
drop policy if exists "Kendi üyeliklerini gör" on group_members;
create policy "Kendi üyeliklerini gör"
  on group_members for select
  using (user_id = auth.uid());

-- Helper to avoid RLS recursion on group_members subqueries
create or replace function public.get_my_group_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from public.group_members where user_id = auth.uid();
$$;

grant execute on function public.get_my_group_ids() to authenticated;

-- Consolidated groups SELECT (members + owners)
drop policy if exists "Gruplar görülebilir" on groups;
create policy "Gruplar görülebilir"
  on groups for select using (
    id in (select public.get_my_group_ids())
    or owner_id = auth.uid()
  );

-- group_members: see co-members in shared groups
drop policy if exists "Üyeleri gör" on group_members;
create policy "Üyeleri gör"
  on group_members for select using (
    user_id = auth.uid()
    or group_id in (select public.get_my_group_ids())
  );

drop policy if exists "Üye ekle" on group_members;
create policy "Üye ekle"
  on group_members for insert
  with check (user_id = auth.uid());

-- Lookup group by invite code (non-members can't read groups table directly)
create or replace function public.lookup_group_by_invite_code(p_code text)
returns table (id uuid, name text, invite_code text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.name, g.invite_code
  from public.groups g
  where g.invite_code = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.lookup_group_by_invite_code(text) to authenticated;
