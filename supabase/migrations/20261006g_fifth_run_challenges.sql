-- Fifth Run goes playable: own top-5 board (endless + challenge runs), challenges from any run
-- on the exact same seeded highway, and an endless-sized score cap for seeded runs.
-- Court Vision behaviour is unchanged (every branch below is scoped to game_id = 'fifth-run').

UPDATE public.arcade_games SET status = 'new' WHERE id = 'fifth-run';

UPDATE public.arcade_boards SET modes = ARRAY['endless', 'timed60', 'challenge'] WHERE game_id = 'fifth-run';

-- submit_run caps 'challenge' runs with the timed60 cap; Fifth Run has no clock, so every mode
-- gets the endless cap (harness max ≈ 50k for a 300 s expert run).
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
    RETURN 100000;
  ELSE
    RETURN 100000;
  END IF;
END;
$function$;

-- Fifth Run: allow endless runs to become challenges, and reuse the run's own seed
-- (meta.seed, e.g. 'run:5d1959ca') so the friend gets the identical track.
CREATE OR REPLACE FUNCTION public.arcade_challenge_from_score(p_device_id text, p_token text, p_score_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_score public.arcade_scores%ROWTYPE;
  v_existing public.arcade_challenges%ROWTYPE;
  v_row public.arcade_challenges%ROWTYPE;
  v_seed text;
  v_meta_seed text;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  SELECT * INTO v_score FROM public.arcade_scores WHERE id = p_score_id AND player_id = v_player.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'score_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_score.created_at < now() - interval '6 hours' THEN RAISE EXCEPTION 'score_too_old' USING ERRCODE = '22023'; END IF;
  IF v_score.mode NOT IN ('timed60', 'challenge')
     AND NOT (v_score.game_id = 'fifth-run' AND v_score.mode = 'endless') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.arcade_challenges
  WHERE creator_score_id = v_score.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_existing.opponent_player_id IS NULL AND v_existing.expires_at > now() THEN
    RETURN public.arcade_challenge_json(v_existing) || jsonb_build_object('reused', true);
  END IF;

  IF v_score.game_id = 'fifth-run' THEN
    v_meta_seed := v_score.meta ->> 'seed';
    IF v_meta_seed IS NULL OR v_meta_seed !~ '^[a-z]{2,8}:[0-9a-f]{6,32}$' THEN v_meta_seed := NULL; END IF;
  END IF;

  v_seed := coalesce(
    v_existing.seed,
    v_meta_seed,
    (SELECT c.seed FROM public.arcade_challenges c WHERE c.id = v_score.challenge_id),
    public.arcade_new_seed('still'));
  v_row := public.arcade_make_challenge(v_player.id, v_score.game_id, v_score.score, v_seed, NULL, NULL, v_score.id);
  RETURN public.arcade_challenge_json(v_row) || jsonb_build_object('reused', false);
END;
$function$;
