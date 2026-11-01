-- Grup katılma, ayrılma, çıkarma, grup silme ve arkadaşlıktan çıkarma bildirimleri.
-- Tetikleyiciyle sunucuda üretilir: katılma ve ayrılma hangi yoldan olursa olsun bildirim gider,
-- istemci metni veya alıcıyı seçemez.

-- ── Ortak yardımcılar (istemci çağıramaz) ─────────────────
create or replace function public.member_display_name(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(display_name), '') from public.profiles where id = p_user_id),
    'Bir üye'
  );
$$;

-- Aynı üye için aynı türde okunmamış bildirim varsa tekrar gönderilmez:
-- gruba girip çıkarak üyeler bildirime boğulamaz
create or replace function public.notify_group_members(
  p_group_id uuid,
  p_group_name text,
  p_member_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_skip uuid[]
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, data)
  select
    gm.user_id,
    p_type,
    p_title,
    p_body,
    jsonb_build_object(
      'group_id', p_group_id,
      'group_name', p_group_name,
      'member_id', p_member_id,
      'member_name', public.member_display_name(p_member_id),
      'actor_id', auth.uid()
    )
  from public.group_members gm
  where gm.group_id = p_group_id
    and not (gm.user_id = any (p_skip))
    and not exists (
      select 1 from public.notifications n
      where n.user_id = gm.user_id
        and n.type = p_type
        and n.is_read = false
        and n.data->>'group_id' = p_group_id::text
        and n.data->>'member_id' = p_member_id::text
    );
$$;

-- ── Gruba katılma ─────────────────────────────────────────
create or replace function public.on_group_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;

  perform public.notify_group_members(
    new.group_id,
    v_group_name,
    new.user_id,
    'group_joined',
    'Yeni Grup Üyesi',
    public.member_display_name(new.user_id) || ', ' || v_group_name || ' grubuna katıldı',
    array[new.user_id]
  );

  return new;
end;
$$;

drop trigger if exists notify_group_member_joined on public.group_members;
create trigger notify_group_member_joined
  after insert on public.group_members
  for each row execute function public.on_group_member_joined();

-- ── Gruptan ayrılma veya çıkarılma ────────────────────────
create or replace function public.on_group_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group_name text;
begin
  -- Grup silinirken üyeler de silinir; o durumda on_group_deleted bildirir
  select name into v_group_name from public.groups where id = old.group_id;
  if not found then
    return old;
  end if;

  if v_actor_id is null or v_actor_id = old.user_id then
    perform public.notify_group_members(
      old.group_id,
      v_group_name,
      old.user_id,
      'group_left',
      'Gruptan Ayrıldı',
      public.member_display_name(old.user_id) || ', ' || v_group_name || ' grubundan ayrıldı',
      array[old.user_id]
    );
    return old;
  end if;

  perform public.notify_group_members(
    old.group_id,
    v_group_name,
    old.user_id,
    'group_left',
    'Gruptan Çıkarıldı',
    public.member_display_name(old.user_id) || ', ' || v_group_name || ' grubundan çıkarıldı',
    array[old.user_id, v_actor_id]
  );

  insert into public.notifications (user_id, type, title, body, data)
  values (
    old.user_id,
    'group_removed',
    'Gruptan Çıkarıldın',
    v_group_name || ' grubundan çıkarıldın',
    jsonb_build_object('group_id', old.group_id, 'group_name', v_group_name, 'actor_id', v_actor_id)
  );

  return old;
end;
$$;

drop trigger if exists notify_group_member_left on public.group_members;
create trigger notify_group_member_left
  after delete on public.group_members
  for each row execute function public.on_group_member_left();

-- ── Grup silme ────────────────────────────────────────────
-- Üyeler henüz silinmeden çalışması için "before"
create or replace function public.on_group_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  insert into public.notifications (user_id, type, title, body, data)
  select
    gm.user_id,
    'group_deleted',
    'Grup Silindi',
    public.member_display_name(old.owner_id) || ', ' || old.name || ' grubunu sildi',
    jsonb_build_object('group_id', old.id, 'group_name', old.name, 'actor_id', v_actor_id)
  from public.group_members gm
  where gm.group_id = old.id
    and gm.user_id is distinct from v_actor_id;

  return old;
end;
$$;

drop trigger if exists notify_group_deleted on public.groups;
create trigger notify_group_deleted
  before delete on public.groups
  for each row execute function public.on_group_deleted();

-- ── Arkadaşlıktan çıkarma ─────────────────────────────────
-- Birleştirme kaydı da silinir: yeniden arkadaş olunca birleştirme sorusu tekrar gelsin
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_user_id = p_friend_id then
    raise exception 'Geçersiz işlem';
  end if;

  if not exists (
    select 1 from public.friends
    where user_id = v_user_id and friend_id = p_friend_id
  ) then
    raise exception 'Arkadaş bulunamadı';
  end if;

  delete from public.friends
  where (user_id = v_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_user_id);

  delete from public.friend_requests
  where (sender_id = v_user_id and receiver_id = p_friend_id)
     or (sender_id = p_friend_id and receiver_id = v_user_id);

  delete from public.merge_requests
  where (requester_id = v_user_id and target_id = p_friend_id)
     or (requester_id = p_friend_id and target_id = v_user_id);

  update public.players
  set linked_user_id = null
  where (user_id = v_user_id and linked_user_id = p_friend_id)
     or (user_id = p_friend_id and linked_user_id = v_user_id);

  if not exists (
    select 1 from public.notifications
    where user_id = p_friend_id
      and type = 'friend_removed'
      and is_read = false
      and data->>'actor_id' = v_user_id::text
  ) then
    v_name := public.member_display_name(v_user_id);
    insert into public.notifications (user_id, type, title, body, data)
    values (
      p_friend_id,
      'friend_removed',
      'Arkadaşlık Sona Erdi',
      v_name || ' seni arkadaş listesinden çıkardı',
      jsonb_build_object('actor_id', v_user_id, 'friend_name', v_name)
    );
  end if;
end;
$$;

-- ── Yetkiler ──────────────────────────────────────────────
alter function public.member_display_name(uuid) owner to postgres;
alter function public.notify_group_members(uuid, text, uuid, text, text, text, uuid[]) owner to postgres;
alter function public.on_group_member_joined() owner to postgres;
alter function public.on_group_member_left() owner to postgres;
alter function public.on_group_deleted() owner to postgres;
alter function public.remove_friend(uuid) owner to postgres;

revoke all on function public.member_display_name(uuid) from public, anon, authenticated;
revoke all on function public.notify_group_members(uuid, text, uuid, text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.on_group_member_joined() from public, anon, authenticated;
revoke all on function public.on_group_member_left() from public, anon, authenticated;
revoke all on function public.on_group_deleted() from public, anon, authenticated;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;
