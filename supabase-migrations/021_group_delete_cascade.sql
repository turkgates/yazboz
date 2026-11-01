-- İstemci grubu silerken yalnızca groups satırını siliyor; üyelikler ve oyun
-- bağlantıları veritabanında yayılarak silinmeli. Eski veritabanında bu elle
-- yapılmıştı, dosyalara girmediği için temiz kurulumda grup silme hata veriyordu.

alter table public.group_members
  drop constraint if exists group_members_group_id_fkey,
  add constraint group_members_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete cascade;

alter table public.group_games
  drop constraint if exists group_games_group_id_fkey,
  add constraint group_games_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete cascade,
  drop constraint if exists group_games_game_id_fkey,
  add constraint group_games_game_id_fkey
    foreign key (game_id) references public.games (id) on delete cascade;
