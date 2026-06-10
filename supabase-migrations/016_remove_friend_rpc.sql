-- Remove friendship from both sides + clean up friend_requests

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  update public.players
  set linked_user_id = null
  where (user_id = v_user_id and linked_user_id = p_friend_id)
     or (user_id = p_friend_id and linked_user_id = v_user_id);
end;
$$;

alter function public.remove_friend(uuid) owner to postgres;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;
