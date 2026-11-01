-- Sosyal tablolara doğrudan yazmayı kapatır.
-- Arkadaşlık, grup üyeliği ve bildirimler artık yalnızca doğrulama yapan
-- security definer fonksiyonlarla oluşur. Eski istemci bu tablolara yazamaz:
-- bu migration'ı çalıştırdıktan hemen sonra istemciyi yayınlayın.

-- ── Açık INSERT politikalarını kaldır ─────────────────────
do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('friends', 'friend_requests', 'group_members', 'notifications')
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

revoke insert, update on public.friends from anon, authenticated;
revoke insert, update on public.friend_requests from anon, authenticated;
revoke insert, update on public.group_members from anon, authenticated;
revoke insert on public.notifications from anon, authenticated;

-- status yalnızca RPC ile değişir; istemci sadece merge_prompted'ı işaretler
grant update (merge_prompted) on public.friend_requests to authenticated;

-- 007'den kalan bu politika kendine başvurup "infinite recursion" hatası veriyor;
-- yerini 009'daki "Üyeleri gör" aldı
drop policy if exists "Üyeler grup üyelerini görür" on public.group_members;

-- group_members silme politikasıyla döngü oluşturur; yerini 009'daki "Gruplar görülebilir" aldı
drop policy if exists "Grup üyeleri grubu görür" on public.groups;

-- ── Grup sahibi üyeliği ───────────────────────────────────
create or replace function public.add_group_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

alter function public.add_group_owner_as_admin() owner to postgres;
revoke all on function public.add_group_owner_as_admin() from public, anon, authenticated;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.add_group_owner_as_admin();

-- ── Davet koduyla gruba katılma ───────────────────────────
create or replace function public.join_group_by_invite_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.groups%rowtype;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  -- Eşzamanlı katılımlarda üye sınırı aşılmasın diye grup satırını kilitle
  select * into v_group
  from public.groups
  where invite_code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Geçersiz davet kodu';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_group.id and user_id = v_user_id
  ) then
    raise exception 'Zaten bu grubun üyesisin';
  end if;

  if (select count(*) from public.group_members where group_id = v_group.id) >= 10 then
    raise exception 'Grup dolu (maksimum 10 üye)';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user_id, 'member');

  return v_group;
end;
$$;

alter function public.join_group_by_invite_code(text) owner to postgres;
revoke all on function public.join_group_by_invite_code(text) from public, anon;
grant execute on function public.join_group_by_invite_code(text) to authenticated;

-- ── Bildirim gönderme ─────────────────────────────────────
-- Metin ve veri sunucuda üretilir: istemci yalnızca alıcıyı ve türü seçer.
create or replace function public.send_notification(p_receiver_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_name text;
  v_request_id uuid;
  v_title text;
  v_body text;
  v_data jsonb;
begin
  if v_sender_id is null then
    raise exception 'Oturum bulunamadı';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'Geçersiz alıcı';
  end if;

  if p_type = 'friend_request' then
    select id into v_request_id
    from public.friend_requests
    where sender_id = v_sender_id
      and receiver_id = p_receiver_id
      and status = 'pending';

    if not found then
      raise exception 'Bekleyen arkadaşlık isteği bulunamadı';
    end if;
  elsif not exists (
    select 1 from public.friends
    where user_id = v_sender_id and friend_id = p_receiver_id
  ) then
    raise exception 'Bu kullanıcıya bildirim gönderemezsin';
  end if;

  -- Aynı kişiden aynı türde okunmamış bildirim varsa tekrar gönderme
  if exists (
    select 1 from public.notifications
    where user_id = p_receiver_id
      and type = p_type
      and is_read = false
      and data->>'actor_id' = v_sender_id::text
  ) then
    return;
  end if;

  select display_name into v_name from public.profiles where id = v_sender_id;
  v_name := coalesce(nullif(trim(v_name), ''), 'Birisi');

  case p_type
    when 'friend_request' then
      v_title := 'Arkadaşlık İsteği';
      v_body := v_name || ' sana arkadaşlık isteği gönderdi';
      v_data := jsonb_build_object(
        'sender_id', v_sender_id,
        'sender_name', v_name,
        'request_id', v_request_id
      );
    when 'friend_accepted' then
      v_title := 'Arkadaşlık İsteği Kabul Edildi';
      v_body := v_name || ' arkadaşlık isteğini kabul etti';
      v_data := jsonb_build_object('friend_id', v_sender_id, 'friend_name', v_name);
    when 'merge_notify' then
      v_title := 'Arkadaşlık';
      v_body := v_name || ' arkadaşlık isteğini kabul etti';
      v_data := jsonb_build_object('friend_id', v_sender_id, 'friend_name', v_name);
    when 'merge_request' then
      v_title := 'Profil Birleştirme';
      v_body := v_name || ' seni yerel oyuncusuyla birleştirmek istiyor';
      v_data := jsonb_build_object(
        'requester_id', v_sender_id,
        'requester_name', v_name,
        'friend_user_id', v_sender_id
      );
    when 'merge_done' then
      v_title := 'Profil Birleştirildi';
      v_body := v_name || ' seni kendi yerel oyuncusuyla birleştirdi. İstatistiklerini kontrol et.';
      v_data := jsonb_build_object('merged_by', v_sender_id, 'merged_by_name', v_name);
    else
      raise exception 'Geçersiz bildirim türü';
  end case;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_receiver_id,
    p_type,
    v_title,
    v_body,
    v_data || jsonb_build_object('actor_id', v_sender_id)
  );
end;
$$;

alter function public.send_notification(uuid, text) owner to postgres;
revoke all on function public.send_notification(uuid, text) from public, anon;
grant execute on function public.send_notification(uuid, text) to authenticated;

-- ── Geçmişte kötüye kullanım var mı? (salt okunur, elle çalıştırın) ──
-- Kabul edilmiş isteği olmayan arkadaşlıklar:
--   select f.* from public.friends f
--   where not exists (
--     select 1 from public.friend_requests fr
--     where fr.status = 'accepted'
--       and ((fr.sender_id = f.user_id and fr.receiver_id = f.friend_id)
--         or (fr.sender_id = f.friend_id and fr.receiver_id = f.user_id))
--   );
-- Grup sahibi olmayan adminler:
--   select gm.* from public.group_members gm
--   join public.groups g on g.id = gm.group_id
--   where gm.role = 'admin' and gm.user_id <> g.owner_id;
