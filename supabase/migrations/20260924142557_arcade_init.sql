-- Fifth Floor Arcade schema (additive only; all objects prefixed arcade_)
-- Project: PRODUCTION - 5D Landing Page (czqkpxxbqleoiicumneu)
-- Never alter existing waitlist / auth objects.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.arcade_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL,
  device_id text NOT NULL,
  user_id uuid NULL, -- reserved for future Supabase Auth link (native app)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_players_handle_len CHECK (char_length(handle) BETWEEN 3 AND 16),
  CONSTRAINT arcade_players_handle_format CHECK (handle ~ '^[a-zA-Z0-9_]+$'),
  CONSTRAINT arcade_players_device_id_len CHECK (char_length(device_id) BETWEEN 8 AND 128),
  CONSTRAINT arcade_players_handle_unique UNIQUE (handle),
  CONSTRAINT arcade_players_device_id_unique UNIQUE (device_id)
);

COMMENT ON COLUMN public.arcade_players.user_id IS
  'Optional Supabase Auth uid for native-app account linking; unused in v1 anonymous mode.';

CREATE TABLE public.arcade_games (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_games_status_check CHECK (status IN ('live', 'coming_soon', 'new'))
);

CREATE TABLE public.arcade_contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.arcade_games (id),
  title text NOT NULL,
  prize_text text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_contests_window_check CHECK (ends_at > starts_at)
);

CREATE TABLE public.arcade_challenges (
  id text PRIMARY KEY,
  game_id text NOT NULL REFERENCES public.arcade_games (id),
  mode text NOT NULL DEFAULT 'challenge',
  creator_player_id uuid NOT NULL REFERENCES public.arcade_players (id),
  target_score int NOT NULL,
  seed text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT arcade_challenges_id_format CHECK (id ~ '^[a-zA-Z0-9_-]{6,16}$'),
  CONSTRAINT arcade_challenges_mode_check CHECK (mode IN ('endless', 'timed60', 'challenge')),
  CONSTRAINT arcade_challenges_target_score_check CHECK (target_score >= 0 AND target_score <= 1000000)
);

CREATE TABLE public.arcade_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.arcade_games (id),
  mode text NOT NULL,
  player_id uuid NOT NULL REFERENCES public.arcade_players (id),
  score int NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  challenge_id text NULL REFERENCES public.arcade_challenges (id),
  contest_id uuid NULL REFERENCES public.arcade_contests (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_scores_mode_check CHECK (mode IN ('endless', 'timed60', 'challenge')),
  CONSTRAINT arcade_scores_score_check CHECK (score >= 0 AND score <= 1000000)
);

-- Leaderboard / rate-limit indexes
CREATE INDEX arcade_scores_leaderboard_idx
  ON public.arcade_scores (game_id, mode, score DESC, created_at ASC);

CREATE INDEX arcade_scores_contest_idx
  ON public.arcade_scores (contest_id, score DESC, created_at ASC)
  WHERE contest_id IS NOT NULL;

CREATE INDEX arcade_scores_player_game_idx
  ON public.arcade_scores (player_id, game_id, mode, score DESC);

CREATE INDEX arcade_scores_challenge_idx
  ON public.arcade_scores (challenge_id, score DESC)
  WHERE challenge_id IS NOT NULL;

CREATE INDEX arcade_scores_created_at_idx
  ON public.arcade_scores (created_at DESC);

CREATE INDEX arcade_scores_player_created_idx
  ON public.arcade_scores (player_id, created_at DESC);

CREATE INDEX arcade_contests_active_idx
  ON public.arcade_contests (game_id, is_active, starts_at, ends_at);

CREATE INDEX arcade_challenges_expires_idx
  ON public.arcade_challenges (expires_at);

-- Seed game registry
INSERT INTO public.arcade_games (id, title, status, sort_order) VALUES
  ('court-vision', 'Court Vision', 'new', 1),
  ('fifth-run', 'Fifth Run', 'live', 2),
  ('break-and-rack', 'Break & Rack', 'coming_soon', 3),
  ('lane-drift', 'Lane Drift', 'coming_soon', 4);

-- ---------------------------------------------------------------------------
-- RLS: enable on all tables; no direct writes for anon/authenticated
-- ---------------------------------------------------------------------------

ALTER TABLE public.arcade_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_contests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.arcade_players FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_games FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_scores FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_contests FROM anon, authenticated;

-- Safe public reads (no device_id / raw score dumps)
GRANT SELECT ON TABLE public.arcade_games TO anon, authenticated;

CREATE POLICY arcade_games_select_public
  ON public.arcade_games
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.arcade_contests TO anon, authenticated;

CREATE POLICY arcade_contests_select_public
  ON public.arcade_contests
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Challenges: public read for share links (no device secrets on this table)
GRANT SELECT ON TABLE public.arcade_challenges TO anon, authenticated;

CREATE POLICY arcade_challenges_select_public
  ON public.arcade_challenges
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Players & scores: no direct SELECT (leaderboards via SECURITY DEFINER RPCs only)
-- service_role retains full access by default in Supabase

GRANT ALL ON TABLE public.arcade_players TO service_role;
GRANT ALL ON TABLE public.arcade_games TO service_role;
GRANT ALL ON TABLE public.arcade_scores TO service_role;
GRANT ALL ON TABLE public.arcade_challenges TO service_role;
GRANT ALL ON TABLE public.arcade_contests TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.arcade_sanitize_handle(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := lower(trim(coalesce(raw, '')));
  cleaned := regexp_replace(cleaned, '[^a-z0-9_]', '', 'g');
  RETURN cleaned;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_score_cap(p_game_id text, p_mode text)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_game_id = 'court-vision' AND p_mode = 'timed60' THEN
    RETURN 2500;
  ELSIF p_game_id = 'court-vision' THEN
    RETURN 50000;
  ELSIF p_game_id = 'fifth-run' AND p_mode = 'timed60' THEN
    RETURN 10000;
  ELSIF p_game_id = 'fifth-run' THEN
    RETURN 100000;
  ELSE
    RETURN 100000;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_new_challenge_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  candidate text;
  i int;
BEGIN
  FOR i IN 1..12 LOOP
    candidate := substr(replace(replace(encode(gen_random_bytes(6), 'base64'), '+', 'x'), '/', 'y'), 1, 8);
    candidate := lower(regexp_replace(candidate, '[^a-z0-9]', '', 'g'));
    IF char_length(candidate) < 8 THEN
      candidate := candidate || substr(md5(random()::text), 1, 8 - char_length(candidate));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.arcade_challenges c WHERE c.id = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'arcade_challenge_id_exhausted';
END;
$$;

-- ---------------------------------------------------------------------------
-- Write RPCs (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.arcade_register_player(p_handle text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_handle text;
  v_device text;
  v_player public.arcade_players%ROWTYPE;
BEGIN
  v_device := trim(coalesce(p_device_id, ''));
  IF char_length(v_device) < 8 OR char_length(v_device) > 128 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;

  v_handle := public.arcade_sanitize_handle(p_handle);
  IF char_length(v_handle) < 3 OR char_length(v_handle) > 16 THEN
    RAISE EXCEPTION 'invalid_handle' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_player
  FROM public.arcade_players
  WHERE device_id = v_device;

  IF FOUND THEN
    -- Same device: allow handle rename if free
    IF v_player.handle IS DISTINCT FROM v_handle THEN
      IF EXISTS (
        SELECT 1 FROM public.arcade_players p
        WHERE p.handle = v_handle AND p.device_id <> v_device
      ) THEN
        RAISE EXCEPTION 'handle_taken' USING ERRCODE = '23505';
      END IF;
      UPDATE public.arcade_players
      SET handle = v_handle
      WHERE id = v_player.id
      RETURNING * INTO v_player;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.arcade_players p WHERE p.handle = v_handle) THEN
      RAISE EXCEPTION 'handle_taken' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.arcade_players (handle, device_id)
    VALUES (v_handle, v_device)
    RETURNING * INTO v_player;
  END IF;

  RETURN jsonb_build_object(
    'id', v_player.id,
    'handle', v_player.handle,
    'created_at', v_player.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_submit_score(
  p_game_id text,
  p_mode text,
  p_score int,
  p_meta jsonb,
  p_device_id text,
  p_challenge_id text DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device text;
  v_player public.arcade_players%ROWTYPE;
  v_game public.arcade_games%ROWTYPE;
  v_mode text;
  v_score int;
  v_cap int;
  v_recent int;
  v_challenge public.arcade_challenges%ROWTYPE;
  v_contest public.arcade_contests%ROWTYPE;
  v_row public.arcade_scores%ROWTYPE;
  v_meta jsonb;
BEGIN
  v_device := trim(coalesce(p_device_id, ''));
  IF char_length(v_device) < 8 OR char_length(v_device) > 128 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_player FROM public.arcade_players WHERE device_id = v_device;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_game FROM public.arcade_games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023';
  END IF;
  IF v_game.status = 'coming_soon' THEN
    RAISE EXCEPTION 'game_not_live' USING ERRCODE = '22023';
  END IF;

  v_mode := coalesce(nullif(trim(p_mode), ''), 'endless');
  IF v_mode NOT IN ('endless', 'timed60', 'challenge') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;

  IF p_score IS NULL OR p_score < 0 THEN
    RAISE EXCEPTION 'invalid_score' USING ERRCODE = '22023';
  END IF;
  v_score := p_score;
  v_cap := public.arcade_score_cap(p_game_id, v_mode);
  IF v_score > v_cap THEN
    RAISE EXCEPTION 'score_too_high' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: max 12 submits / device / rolling minute
  SELECT count(*) INTO v_recent
  FROM public.arcade_scores s
  WHERE s.player_id = v_player.id
    AND s.created_at > now() - interval '1 minute';
  IF v_recent >= 12 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;

  IF p_challenge_id IS NOT NULL AND length(trim(p_challenge_id)) > 0 THEN
    SELECT * INTO v_challenge
    FROM public.arcade_challenges
    WHERE id = trim(p_challenge_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_challenge.expires_at < now() THEN
      RAISE EXCEPTION 'challenge_expired' USING ERRCODE = '22023';
    END IF;
    IF v_challenge.game_id <> p_game_id THEN
      RAISE EXCEPTION 'challenge_game_mismatch' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_challenge_id := NULL;
  END IF;

  IF p_contest_id IS NOT NULL THEN
    SELECT * INTO v_contest FROM public.arcade_contests WHERE id = p_contest_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_contest.is_active
       OR v_contest.starts_at > now()
       OR v_contest.ends_at < now()
       OR v_contest.game_id <> p_game_id THEN
      RAISE EXCEPTION 'contest_not_active' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_meta := coalesce(p_meta, '{}'::jsonb);
  IF jsonb_typeof(v_meta) <> 'object' THEN
    v_meta := '{}'::jsonb;
  END IF;

  INSERT INTO public.arcade_scores (
    game_id, mode, player_id, score, meta, challenge_id, contest_id
  ) VALUES (
    p_game_id, v_mode, v_player.id, v_score, v_meta, p_challenge_id, p_contest_id
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'game_id', v_row.game_id,
    'mode', v_row.mode,
    'score', v_row.score,
    'player_id', v_row.player_id,
    'handle', v_player.handle,
    'challenge_id', v_row.challenge_id,
    'contest_id', v_row.contest_id,
    'created_at', v_row.created_at,
    'personal_best', (
      SELECT coalesce(max(s.score), v_score)
      FROM public.arcade_scores s
      WHERE s.player_id = v_player.id
        AND s.game_id = p_game_id
        AND s.mode = v_mode
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_create_challenge(
  p_game_id text,
  p_mode text,
  p_device_id text,
  p_target_score int,
  p_seed text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device text;
  v_player public.arcade_players%ROWTYPE;
  v_game public.arcade_games%ROWTYPE;
  v_mode text;
  v_id text;
  v_row public.arcade_challenges%ROWTYPE;
  v_seed text;
  v_cap int;
BEGIN
  v_device := trim(coalesce(p_device_id, ''));
  IF char_length(v_device) < 8 OR char_length(v_device) > 128 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_player FROM public.arcade_players WHERE device_id = v_device;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_game FROM public.arcade_games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023';
  END IF;
  IF v_game.status = 'coming_soon' THEN
    RAISE EXCEPTION 'game_not_live' USING ERRCODE = '22023';
  END IF;

  v_mode := coalesce(nullif(trim(p_mode), ''), 'challenge');
  IF v_mode NOT IN ('endless', 'timed60', 'challenge') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;

  IF p_target_score IS NULL OR p_target_score < 0 THEN
    RAISE EXCEPTION 'invalid_score' USING ERRCODE = '22023';
  END IF;
  v_cap := public.arcade_score_cap(p_game_id, v_mode);
  IF p_target_score > v_cap THEN
    RAISE EXCEPTION 'score_too_high' USING ERRCODE = '22023';
  END IF;

  v_seed := left(coalesce(p_seed, ''), 128);
  v_id := public.arcade_new_challenge_id();

  INSERT INTO public.arcade_challenges (
    id, game_id, mode, creator_player_id, target_score, seed
  ) VALUES (
    v_id, p_game_id, v_mode, v_player.id, p_target_score, v_seed
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'game_id', v_row.game_id,
    'mode', v_row.mode,
    'target_score', v_row.target_score,
    'seed', v_row.seed,
    'creator_handle', v_player.handle,
    'creator_player_id', v_player.id,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Read RPCs / leaderboards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.arcade_list_games()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(g)::jsonb ORDER BY g.sort_order), '[]'::jsonb)
  FROM (
    SELECT id, title, status, sort_order, created_at
    FROM public.arcade_games
    ORDER BY sort_order
  ) g;
$$;

CREATE OR REPLACE FUNCTION public.arcade_leaderboard(
  p_game_id text,
  p_window text DEFAULT 'weekly',
  p_mode text DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_limit int DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit int;
  v_window text;
  v_mode text;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.arcade_games g WHERE g.id = p_game_id) THEN
    RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_window := lower(coalesce(p_window, 'weekly'));
  v_mode := nullif(trim(coalesce(p_mode, '')), '');

  IF v_window = 'contest' THEN
    IF p_contest_id IS NULL THEN
      RAISE EXCEPTION 'contest_required' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.rank), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        row_number() OVER (ORDER BY best.score DESC, best.achieved_at ASC) AS rank,
        best.player_id,
        best.handle,
        best.score,
        best.achieved_at AS created_at
      FROM (
        SELECT DISTINCT ON (s.player_id)
          s.player_id,
          p.handle,
          s.score,
          s.created_at AS achieved_at
        FROM public.arcade_scores s
        JOIN public.arcade_players p ON p.id = s.player_id
        WHERE s.game_id = p_game_id
          AND s.contest_id = p_contest_id
          AND (v_mode IS NULL OR s.mode = v_mode)
        ORDER BY s.player_id, s.score DESC, s.created_at ASC
      ) best
      ORDER BY best.score DESC, best.achieved_at ASC
      LIMIT v_limit
    ) x;
    RETURN jsonb_build_object(
      'game_id', p_game_id,
      'window', 'contest',
      'contest_id', p_contest_id,
      'mode', v_mode,
      'entries', coalesce(v_result, '[]'::jsonb)
    );
  END IF;

  IF v_window NOT IN ('weekly', 'alltime') THEN
    RAISE EXCEPTION 'invalid_window' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.rank), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      row_number() OVER (ORDER BY best.score DESC, best.achieved_at ASC) AS rank,
      best.player_id,
      best.handle,
      best.score,
      best.achieved_at AS created_at
    FROM (
      SELECT DISTINCT ON (s.player_id)
        s.player_id,
        p.handle,
        s.score,
        s.created_at AS achieved_at
      FROM public.arcade_scores s
      JOIN public.arcade_players p ON p.id = s.player_id
      WHERE s.game_id = p_game_id
        AND (v_mode IS NULL OR s.mode = v_mode)
        AND (
          v_window = 'alltime'
          OR (
            EXTRACT(ISOYEAR FROM (s.created_at AT TIME ZONE 'America/New_York'))
              = EXTRACT(ISOYEAR FROM (now() AT TIME ZONE 'America/New_York'))
            AND EXTRACT(WEEK FROM (s.created_at AT TIME ZONE 'America/New_York'))
              = EXTRACT(WEEK FROM (now() AT TIME ZONE 'America/New_York'))
          )
        )
      ORDER BY s.player_id, s.score DESC, s.created_at ASC
    ) best
    ORDER BY best.score DESC, best.achieved_at ASC
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object(
    'game_id', p_game_id,
    'window', v_window,
    'mode', v_mode,
    'entries', coalesce(v_result, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_personal_best(
  p_device_id text,
  p_game_id text,
  p_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_mode text;
  v_best int;
  v_at timestamptz;
BEGIN
  SELECT * INTO v_player
  FROM public.arcade_players
  WHERE device_id = trim(coalesce(p_device_id, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'game_id', p_game_id,
      'score', 0
    );
  END IF;

  v_mode := nullif(trim(coalesce(p_mode, '')), '');

  SELECT s.score, s.created_at
  INTO v_best, v_at
  FROM public.arcade_scores s
  WHERE s.player_id = v_player.id
    AND s.game_id = p_game_id
    AND (v_mode IS NULL OR s.mode = v_mode)
  ORDER BY s.score DESC, s.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'player_id', v_player.id,
    'handle', v_player.handle,
    'game_id', p_game_id,
    'mode', v_mode,
    'score', coalesce(v_best, 0),
    'achieved_at', v_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_get_challenge(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chal public.arcade_challenges%ROWTYPE;
  v_creator public.arcade_players%ROWTYPE;
  v_attempts jsonb;
BEGIN
  SELECT * INTO v_chal FROM public.arcade_challenges WHERE id = trim(coalesce(p_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_creator FROM public.arcade_players WHERE id = v_chal.creator_player_id;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.created_at ASC), '[]'::jsonb)
  INTO v_attempts
  FROM (
    SELECT
      p.handle,
      s.player_id,
      s.score,
      s.created_at,
      (s.player_id = v_chal.creator_player_id) AS is_creator
    FROM public.arcade_scores s
    JOIN public.arcade_players p ON p.id = s.player_id
    WHERE s.challenge_id = v_chal.id
    ORDER BY s.score DESC, s.created_at ASC
    LIMIT 50
  ) x;

  RETURN jsonb_build_object(
    'id', v_chal.id,
    'game_id', v_chal.game_id,
    'mode', v_chal.mode,
    'target_score', v_chal.target_score,
    'seed', v_chal.seed,
    'creator_handle', v_creator.handle,
    'creator_player_id', v_creator.id,
    'created_at', v_chal.created_at,
    'expires_at', v_chal.expires_at,
    'expired', v_chal.expires_at < now(),
    'attempts', coalesce(v_attempts, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_list_active_contests(p_game_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.starts_at), '[]'::jsonb)
  FROM (
    SELECT id, game_id, title, prize_text, starts_at, ends_at, is_active
    FROM public.arcade_contests
    WHERE is_active = true
      AND starts_at <= now()
      AND ends_at >= now()
      AND (p_game_id IS NULL OR game_id = p_game_id)
    ORDER BY starts_at
  ) c;
$$;

-- Grants: execute RPCs for anon; revoke helpers that are internal-only from public if desired
REVOKE ALL ON FUNCTION public.arcade_sanitize_handle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_score_cap(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_new_challenge_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.arcade_sanitize_handle(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_score_cap(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_new_challenge_id() TO service_role;

GRANT EXECUTE ON FUNCTION public.arcade_register_player(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_submit_score(text, text, int, jsonb, text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_create_challenge(text, text, text, int, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_list_games() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_leaderboard(text, text, text, uuid, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_personal_best(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_get_challenge(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_list_active_contests(text) TO anon, authenticated, service_role;
