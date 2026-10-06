-- Fifth Run v2: distance + stars scoring can exceed the old 100k endless cap on long runs.
-- Court Vision caps unchanged (branches still scoped by game_id).
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
  ELSE
    RETURN 100000;
  END IF;
END;
$function$;
