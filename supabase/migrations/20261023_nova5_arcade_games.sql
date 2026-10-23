-- NOVA 5 (street-shift) live in lobby registry + boards
UPDATE public.arcade_games SET sort_order = 4 WHERE id = 'break-and-rack';
UPDATE public.arcade_games SET sort_order = 5 WHERE id = 'lane-drift';

INSERT INTO public.arcade_games (id, title, status, sort_order)
VALUES ('street-shift', 'NOVA 5', 'new', 3)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.arcade_boards (game_id, modes, size, label)
VALUES ('street-shift', ARRAY['endless', 'timed60', 'challenge'], 5, 'Endless')
ON CONFLICT (game_id) DO UPDATE
SET modes = EXCLUDED.modes,
    size = EXCLUDED.size,
    label = EXCLUDED.label;
