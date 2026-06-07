alter table games add column if not exists teams jsonb;
alter table games add column if not exists game_subtype text default 'solo';
alter table rounds add column if not exists indicator_players jsonb default '[]';
