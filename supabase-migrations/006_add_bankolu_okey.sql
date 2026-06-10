alter table rounds add column if not exists banko_players jsonb default '[]';

alter table games add column if not exists banko_history jsonb default '{}';
