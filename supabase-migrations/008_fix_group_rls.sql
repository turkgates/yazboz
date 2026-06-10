-- Fix group creation RLS policies
-- FOR ALL policy alone may not grant INSERT reliably in all Postgres/Supabase setups

drop policy if exists "Kullanıcı grup oluşturabilir" on groups;
create policy "Kullanıcı grup oluşturabilir"
  on groups for insert
  with check (owner_id = auth.uid());

-- Owner can read their group before group_members row exists (post-insert .select())
drop policy if exists "Grup sahibi grubu görür" on groups;
create policy "Grup sahibi grubu görür"
  on groups for select
  using (owner_id = auth.uid());

drop policy if exists "Grup üyesi eklenebilir" on group_members;
create policy "Grup üyesi eklenebilir"
  on group_members for insert
  with check (user_id = auth.uid());
