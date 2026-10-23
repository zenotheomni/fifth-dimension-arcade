-- FIFTH FRAME live; park NOVA 5 (street-shift) from lobby
UPDATE public.arcade_games
SET status = 'coming_soon', title = 'NOVA 5'
WHERE id = 'street-shift';

UPDATE public.arcade_games SET sort_order = 4 WHERE id = 'break-and-rack';
UPDATE public.arcade_games SET sort_order = 5 WHERE id = 'lane-drift';

INSERT INTO public.arcade_games (id, title, status, sort_order)
VALUES ('fifth-frame', 'FIFTH FRAME', 'new', 3)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.arcade_boards (game_id, modes, size, label)
VALUES ('fifth-frame', ARRAY['endless', 'timed60', 'challenge'], 5, '10 Frames')
ON CONFLICT (game_id) DO UPDATE
SET modes = EXCLUDED.modes,
    size = EXCLUDED.size,
    label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.arcade_score_cap(p_game_id text, p_mode text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_game_id = 'court-vision' AND p_mode = 'timed60' THEN
    RETURN 2500;
  ELSIF p_game_id = 'court-vision' THEN
    RETURN 50000;
  ELSIF p_game_id = 'fifth-run' THEN
    RETURN 500000;
  ELSIF p_game_id = 'fifth-frame' THEN
    RETURN 300;
  ELSE
    RETURN 100000;
  END IF;
END;
$function$;
