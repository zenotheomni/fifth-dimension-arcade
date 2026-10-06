-- Giveaway contests v2 RPCs + ticker + story score card.

-- ───────────── internal helpers ─────────────
CREATE OR REPLACE FUNCTION public.arcade_contest_status(c public.arcade_contests)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN c.winners_announced_at IS NOT NULL THEN 'winners_announced'
    WHEN now() < c.starts_at THEN 'upcoming'
    WHEN now() < c.ends_at THEN 'live'
    ELSE 'ended' END
$$;

CREATE OR REPLACE FUNCTION public.arcade_server_key_ok(p_name text, p_key text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(char_length(p_key) >= 24 AND EXISTS (
    SELECT 1 FROM public.arcade_server_keys k
    WHERE k.name = p_name AND k.key_hash = public.arcade_sha256(p_key)), false)
$$;

CREATE OR REPLACE FUNCTION public.arcade_admin_ok(p_key text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.arcade_server_key_ok('admin', p_key) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

-- Best score per player, only runs inside [starts_at, ends_at), counted modes of the game's board.
CREATE OR REPLACE FUNCTION public.arcade_contest_ranked(p_contest_id uuid)
RETURNS TABLE(rank bigint, player_id uuid, handle text, is_guest boolean, score integer, score_id uuid, achieved_at timestamptz)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH ct AS (SELECT x.game_id, x.starts_at, x.ends_at FROM public.arcade_contests x WHERE x.id = p_contest_id),
  bd AS (SELECT b.modes FROM public.arcade_boards b, ct WHERE b.game_id = ct.game_id),
  best AS (
    SELECT DISTINCT ON (s.player_id) s.player_id, s.score, s.id AS score_id, s.created_at
    FROM public.arcade_scores s, ct, bd
    WHERE s.game_id = ct.game_id AND s.mode = ANY (bd.modes)
      AND s.created_at >= ct.starts_at AND s.created_at < ct.ends_at
    ORDER BY s.player_id, s.score DESC, s.created_at ASC
  )
  SELECT row_number() OVER (ORDER BY best.score DESC, best.created_at ASC),
         best.player_id, p.handle, p.is_guest, best.score, best.score_id, best.created_at
  FROM best JOIN public.arcade_players p ON p.id = best.player_id
$$;

CREATE OR REPLACE FUNCTION public.arcade_contest_json(c public.arcade_contests, p_player_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'game_id', c.game_id,
    'game_title', (SELECT g.title FROM public.arcade_games g WHERE g.id = c.game_id),
    'title', c.title, 'prize_text', c.prize_text, 'prize_image_url', c.prize_image_url,
    'rules_text', c.rules_text, 'how_to_claim', c.how_to_claim,
    'starts_at', c.starts_at, 'ends_at', c.ends_at, 'ended_early', c.ended_early_at IS NOT NULL,
    'winner_count', c.winner_count, 'is_test', c.is_test,
    'status', public.arcade_contest_status(c),
    'winners_announced_at', c.winners_announced_at,
    'winners', coalesce((
      SELECT jsonb_agg(jsonb_build_object('place', w.place, 'handle', p.handle, 'score', w.score,
               'is_me', w.player_id IS NOT DISTINCT FROM p_player_id) ORDER BY w.place)
      FROM public.arcade_contest_winners w JOIN public.arcade_players p ON p.id = w.player_id
      WHERE w.contest_id = c.id AND c.winners_announced_at IS NOT NULL), '[]'::jsonb),
    'server_now', now())
$$;

CREATE OR REPLACE FUNCTION public.arcade_admin_contest_json(c public.arcade_contests)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT public.arcade_contest_json(c, NULL) || jsonb_build_object(
    'published', c.is_active, 'auto_announce', c.auto_announce,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'entrants', (SELECT count(*) FROM public.arcade_contest_ranked(c.id)),
    'winners', coalesce((
      SELECT jsonb_agg(jsonb_build_object('place', w.place, 'player_id', w.player_id, 'handle', p.handle,
               'handle_at_win', w.handle, 'is_guest', p.is_guest, 'score', w.score, 'claim_code', w.claim_code,
               'contacted_at', w.contacted_at, 'admin_note', w.admin_note) ORDER BY w.place)
      FROM public.arcade_contest_winners w JOIN public.arcade_players p ON p.id = w.player_id
      WHERE w.contest_id = c.id), '[]'::jsonb))
$$;

-- Pick winners for an ended contest, alert them, mark announced. Idempotent.
CREATE OR REPLACE FUNCTION public.arcade_contest_announce(p_contest_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
  r record;
  v_code text;
  v_alert bigint;
  v_alerts int := 0;
  v_claim text;
BEGIN
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.winners_announced_at IS NOT NULL THEN RETURN 0; END IF;
  IF now() < c.ends_at THEN RAISE EXCEPTION 'contest_not_ended' USING ERRCODE = '22023'; END IF;
  v_claim := coalesce(nullif(btrim(c.how_to_claim), ''), 'Screenshot this and DM Fifth Dimension to claim your prize.');
  FOR r IN SELECT * FROM public.arcade_contest_ranked(c.id) x WHERE x.rank <= c.winner_count ORDER BY x.rank LOOP
    v_code := 'FF-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    v_alert := public.arcade_alert(
      r.player_id, NULL, 'contest_won', NULL,
      CASE WHEN r.rank = 1 THEN 'You won ' || c.title || '!'
           ELSE 'You placed #' || r.rank || ' in ' || c.title || '!' END,
      'Claim code ' || v_code || ' · ' || coalesce(nullif(c.prize_text, ''), 'Prize') || '. ' || v_claim,
      '/arcade/?contest=' || c.id::text,
      jsonb_build_object('contest_id', c.id, 'place', r.rank, 'score', r.score, 'claim_code', v_code));
    INSERT INTO public.arcade_contest_winners (contest_id, place, player_id, handle, score, score_id, claim_code, alert_id)
    VALUES (c.id, r.rank, r.player_id, r.handle, r.score, r.score_id, v_code, v_alert);
    v_alerts := v_alerts + 1;
  END LOOP;
  UPDATE public.arcade_contests SET winners_announced_at = now(), updated_at = now() WHERE id = c.id;
  RETURN v_alerts;
END $$;

-- ───────────── public reads ─────────────
CREATE OR REPLACE FUNCTION public.arcade_contests_public(p_player_id uuid DEFAULT NULL, p_include_test boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH sel AS (
    SELECT c, CASE public.arcade_contest_status(c) WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'ended' THEN 2 ELSE 3 END AS grp
    FROM public.arcade_contests c
    WHERE c.is_active AND (p_include_test OR NOT c.is_test)
      AND c.starts_at <= now() + interval '45 days'
      AND c.ends_at >= now() - interval '7 days'
  ), top AS (
    SELECT sel.c, sel.grp FROM sel
    ORDER BY sel.grp, CASE WHEN sel.grp = 1 THEN (sel.c).starts_at END ASC, (sel.c).ends_at DESC
    LIMIT 10
  )
  SELECT jsonb_build_object('server_now', now(), 'contests', coalesce(
    (SELECT jsonb_agg(public.arcade_contest_json(top.c, p_player_id)
       ORDER BY top.grp, CASE WHEN top.grp = 1 THEN (top.c).starts_at END ASC, (top.c).ends_at DESC) FROM top),
    '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.arcade_contest_board(p_contest_id uuid, p_player_id uuid DEFAULT NULL,
  p_limit integer DEFAULT NULL, p_include_test boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
  v_size int;
  v_limit int;
  v_entries jsonb;
  v_me jsonb;
  v_total bigint;
BEGIN
  SELECT * INTO c FROM public.arcade_contests x
  WHERE x.id = p_contest_id AND x.is_active AND (p_include_test OR NOT x.is_test);
  IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT b.size INTO v_size FROM public.arcade_boards b WHERE b.game_id = c.game_id;
  v_size := coalesce(v_size, 5);
  v_limit := least(greatest(coalesce(p_limit, v_size), 1), 25);
  WITH r AS (SELECT * FROM public.arcade_contest_ranked(c.id))
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player_id', r.player_id, 'handle', r.handle,
      'score', r.score, 'created_at', r.achieved_at, 'is_me', r.player_id IS NOT DISTINCT FROM p_player_id)
      ORDER BY r.rank) FILTER (WHERE r.rank <= v_limit), '[]'::jsonb),
    (SELECT jsonb_build_object('rank', m.rank, 'score', m.score, 'handle', m.handle) FROM r m WHERE m.player_id = p_player_id),
    count(*)
  INTO v_entries, v_me, v_total
  FROM r;
  RETURN jsonb_build_object('game_id', c.game_id, 'window', 'contest', 'size', v_size, 'label', 'Contest',
    'modes', (SELECT to_jsonb(b.modes) FROM public.arcade_boards b WHERE b.game_id = c.game_id),
    'contest', public.arcade_contest_json(c, p_player_id),
    'entries', v_entries, 'me', v_me, 'total', v_total);
END $$;

-- Ticker: best score per player (weekly + all-time top 5 per board game) + the featured contest.
CREATE OR REPLACE FUNCTION public.arcade_ticker(p_include_test boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_boards jsonb;
  v_contest jsonb;
  c public.arcade_contests%ROWTYPE;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'game_id', b.game_id, 'game_title', g.title, 'label', b.label,
      'weekly', (SELECT coalesce(jsonb_agg(jsonb_build_object('rank', w.rank, 'handle', w.handle, 'score', w.score) ORDER BY w.rank), '[]'::jsonb)
                 FROM public.arcade_board_ranked(b.game_id, 'weekly') w WHERE w.rank <= 5),
      'alltime', (SELECT coalesce(jsonb_agg(jsonb_build_object('rank', a.rank, 'handle', a.handle, 'score', a.score) ORDER BY a.rank), '[]'::jsonb)
                  FROM public.arcade_board_ranked(b.game_id, 'alltime') a WHERE a.rank <= 5))
    ORDER BY (b.game_id <> 'court-vision'), b.game_id), '[]'::jsonb)
  INTO v_boards
  FROM public.arcade_boards b JOIN public.arcade_games g ON g.id = b.game_id;

  SELECT * INTO c FROM public.arcade_contests x
  WHERE x.is_active AND (p_include_test OR NOT x.is_test)
    AND ((now() >= x.starts_at AND now() < x.ends_at)
      OR (x.starts_at > now() AND x.starts_at <= now() + interval '7 days')
      OR (x.winners_announced_at IS NOT NULL AND x.ends_at >= now() - interval '3 days'))
  ORDER BY CASE WHEN now() >= x.starts_at AND now() < x.ends_at THEN 0 WHEN x.starts_at > now() THEN 1 ELSE 2 END,
           x.ends_at
  LIMIT 1;
  IF FOUND THEN
    v_contest := public.arcade_contest_json(c, NULL) || jsonb_build_object('leaders', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('rank', l.rank, 'handle', l.handle, 'score', l.score) ORDER BY l.rank), '[]'::jsonb)
      FROM public.arcade_contest_ranked(c.id) l WHERE l.rank <= 3));
  END IF;
  RETURN jsonb_build_object('boards', v_boards, 'contest', v_contest, 'server_now', now());
END $$;

-- Story score card data (by unguessable score id).
CREATE OR REPLACE FUNCTION public.arcade_score_card(p_score_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.arcade_scores%ROWTYPE;
  v_handle text;
  v_title text;
  v_size int;
  v_modes text[];
  v_all bigint;
  v_week bigint;
  v_contest jsonb;
  v_streak int;
BEGIN
  SELECT * INTO s FROM public.arcade_scores WHERE id = p_score_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'score_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT p.handle INTO v_handle FROM public.arcade_players p WHERE p.id = s.player_id;
  SELECT g.title INTO v_title FROM public.arcade_games g WHERE g.id = s.game_id;
  SELECT b.size, b.modes INTO v_size, v_modes FROM public.arcade_boards b WHERE b.game_id = s.game_id;
  v_size := coalesce(v_size, 5);
  IF v_modes IS NOT NULL AND s.mode = ANY (v_modes) THEN
    SELECT ra.rank INTO v_all FROM public.arcade_board_ranked(s.game_id, 'alltime') ra
    WHERE ra.player_id = s.player_id AND ra.score = s.score;
    IF s.created_at >= public.arcade_week_start() THEN
      SELECT rw.rank INTO v_week FROM public.arcade_board_ranked(s.game_id, 'weekly') rw
      WHERE rw.player_id = s.player_id AND rw.score = s.score;
    END IF;
    SELECT jsonb_build_object('id', ct.id, 'title', ct.title, 'rank', rc.rank) INTO v_contest
    FROM public.arcade_contests ct
    CROSS JOIN LATERAL public.arcade_contest_ranked(ct.id) rc
    WHERE ct.is_active AND NOT ct.is_test AND ct.game_id = s.game_id
      AND s.created_at >= ct.starts_at AND s.created_at < ct.ends_at
      AND rc.player_id = s.player_id AND rc.score = s.score
    ORDER BY ct.ends_at DESC
    LIMIT 1;
  END IF;
  v_streak := CASE WHEN (s.meta->>'bestStreak') ~ '^[0-9]{1,4}$' THEN least((s.meta->>'bestStreak')::int, 999) END;
  RETURN jsonb_build_object(
    'id', s.id, 'handle', coalesce(v_handle, 'Player'), 'score', s.score, 'game_id', s.game_id,
    'game_title', coalesce(v_title, s.game_id), 'mode', s.mode, 'best_streak', v_streak, 'created_at', s.created_at,
    'alltime_rank', CASE WHEN v_all <= v_size THEN v_all END,
    'weekly_rank', CASE WHEN v_week <= v_size THEN v_week END,
    'contest', CASE WHEN (v_contest->>'rank')::int <= v_size THEN v_contest END);
END $$;

-- ───────────── server-key gated ─────────────
CREATE OR REPLACE FUNCTION public.arcade_contest_finalize(p_server_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_n int := 0;
  v_alerts int := 0;
BEGIN
  IF NOT public.arcade_server_key_ok('push', p_server_key) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR v_id IN
    SELECT x.id FROM public.arcade_contests x
    WHERE x.is_active AND x.auto_announce AND x.winners_announced_at IS NULL AND x.ends_at <= now()
    ORDER BY x.ends_at LIMIT 10
    FOR UPDATE SKIP LOCKED
  LOOP
    v_alerts := v_alerts + public.arcade_contest_announce(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('announced', v_n, 'alerts_created', v_alerts);
END $$;

-- ───────────── admin (admin-key gated) ─────────────
CREATE OR REPLACE FUNCTION public.arcade_admin_contests(p_admin_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  RETURN jsonb_build_object(
    'server_now', now(),
    'games', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.game_id, 'title', g.title, 'label', b.label)
                ORDER BY (b.game_id <> 'court-vision'), b.game_id), '[]'::jsonb)
              FROM public.arcade_boards b JOIN public.arcade_games g ON g.id = b.game_id),
    'contests', (SELECT coalesce(jsonb_agg(public.arcade_admin_contest_json(x) ORDER BY x.starts_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM public.arcade_contests ORDER BY starts_at DESC LIMIT 50) x));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_contest_save(p_admin_key text, p_contest jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
  v_id uuid;
  v_title text;
  v_game text;
  v_start timestamptz;
  v_end timestamptz;
  v_prize text;
  v_img text;
  v_rules text;
  v_claim text;
  v_wc int;
  v_auto boolean;
  v_pub boolean;
  v_test boolean;
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  IF p_contest IS NULL OR jsonb_typeof(p_contest) <> 'object' THEN
    RAISE EXCEPTION 'invalid_contest' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := nullif(p_contest->>'id', '')::uuid;
    v_start := (p_contest->>'starts_at')::timestamptz;
    v_end := (p_contest->>'ends_at')::timestamptz;
    v_wc := coalesce(nullif(p_contest->>'winner_count', '')::int, 1);
    v_auto := coalesce((p_contest->>'auto_announce')::boolean, true);
    v_pub := coalesce((p_contest->>'published')::boolean, false);
    v_test := coalesce((p_contest->>'is_test')::boolean, false);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid_contest' USING ERRCODE = '22023';
  END;
  v_title := btrim(coalesce(p_contest->>'title', ''));
  v_game := btrim(coalesce(p_contest->>'game_id', ''));
  v_prize := btrim(coalesce(p_contest->>'prize_text', ''));
  v_img := nullif(btrim(coalesce(p_contest->>'prize_image_url', '')), '');
  v_rules := coalesce(p_contest->>'rules_text', '');
  v_claim := btrim(coalesce(p_contest->>'how_to_claim', ''));

  IF char_length(v_title) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.arcade_boards b WHERE b.game_id = v_game) THEN
    RAISE EXCEPTION 'invalid_game' USING ERRCODE = '22023';
  END IF;
  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR v_end - v_start > interval '120 days' THEN
    RAISE EXCEPTION 'invalid_dates' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_prize) > 200 THEN RAISE EXCEPTION 'invalid_prize' USING ERRCODE = '22023'; END IF;
  IF v_img IS NOT NULL AND (v_img !~ '^https://[^\s"''<>]+$' OR char_length(v_img) > 600) THEN
    RAISE EXCEPTION 'invalid_prize_image' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_rules) > 4000 OR char_length(v_claim) > 500 THEN
    RAISE EXCEPTION 'invalid_rules' USING ERRCODE = '22023';
  END IF;
  IF v_wc NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_winner_count' USING ERRCODE = '22023'; END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.arcade_contests (game_id, title, prize_text, prize_image_url, rules_text, how_to_claim,
      starts_at, ends_at, winner_count, auto_announce, is_active, is_test)
    VALUES (v_game, v_title, v_prize, v_img, v_rules, v_claim, v_start, v_end, v_wc, v_auto, v_pub, v_test)
    RETURNING * INTO c;
    INSERT INTO public.arcade_admin_log (action, contest_id, detail) VALUES ('contest_create', c.id, jsonb_build_object('title', v_title));
  ELSE
    SELECT * INTO c FROM public.arcade_contests WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
    IF c.winners_announced_at IS NOT NULL
       AND (v_game <> c.game_id OR v_start <> c.starts_at OR v_end <> c.ends_at OR v_wc <> c.winner_count) THEN
      RAISE EXCEPTION 'contest_locked' USING ERRCODE = '22023';
    END IF;
    IF now() >= c.starts_at AND v_game <> c.game_id THEN
      RAISE EXCEPTION 'contest_locked' USING ERRCODE = '22023';
    END IF;
    UPDATE public.arcade_contests SET
      game_id = v_game, title = v_title, prize_text = v_prize, prize_image_url = v_img, rules_text = v_rules,
      how_to_claim = v_claim, starts_at = v_start, ends_at = v_end, winner_count = v_wc,
      auto_announce = v_auto, is_active = v_pub, is_test = v_test, updated_at = now()
    WHERE id = v_id
    RETURNING * INTO c;
    INSERT INTO public.arcade_admin_log (action, contest_id, detail) VALUES ('contest_update', c.id, jsonb_build_object('title', v_title));
  END IF;
  RETURN jsonb_build_object('contest', public.arcade_admin_contest_json(c));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_contest_end(p_admin_key text, p_contest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
  v_alerts int := 0;
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.winners_announced_at IS NOT NULL THEN RAISE EXCEPTION 'contest_already_announced' USING ERRCODE = '22023'; END IF;
  IF now() < c.starts_at THEN RAISE EXCEPTION 'contest_not_started' USING ERRCODE = '22023'; END IF;
  IF now() < c.ends_at THEN
    UPDATE public.arcade_contests SET ends_at = now(), ended_early_at = now(), updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  END IF;
  IF c.auto_announce THEN v_alerts := public.arcade_contest_announce(c.id); END IF;
  INSERT INTO public.arcade_admin_log (action, contest_id, detail) VALUES ('contest_end', c.id, jsonb_build_object('alerts', v_alerts));
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id;
  RETURN jsonb_build_object('contest', public.arcade_admin_contest_json(c), 'alerts_created', v_alerts);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_contest_announce(p_admin_key text, p_contest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
  v_alerts int;
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  v_alerts := public.arcade_contest_announce(p_contest_id);
  INSERT INTO public.arcade_admin_log (action, contest_id, detail) VALUES ('contest_announce', p_contest_id, jsonb_build_object('alerts', v_alerts));
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id;
  RETURN jsonb_build_object('contest', public.arcade_admin_contest_json(c), 'alerts_created', v_alerts);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_contest_board(p_admin_key text, p_contest_id uuid, p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'contest', public.arcade_admin_contest_json(c),
    'entries', (SELECT coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player_id', r.player_id, 'handle', r.handle,
                  'is_guest', r.is_guest, 'score', r.score, 'created_at', r.achieved_at) ORDER BY r.rank), '[]'::jsonb)
                FROM public.arcade_contest_ranked(c.id) r
                WHERE r.rank <= least(greatest(coalesce(p_limit, 25), 1), 100)));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_winner_update(p_admin_key text, p_contest_id uuid, p_place integer,
  p_contacted boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.arcade_contests%ROWTYPE;
BEGIN
  PERFORM public.arcade_admin_ok(p_admin_key);
  UPDATE public.arcade_contest_winners w SET
    contacted_at = CASE WHEN p_contacted THEN coalesce(w.contacted_at, now()) ELSE NULL END,
    admin_note = coalesce(left(p_note, 500), w.admin_note)
  WHERE w.contest_id = p_contest_id AND w.place = p_place;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner_not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.arcade_admin_log (action, contest_id, detail)
  VALUES ('winner_update', p_contest_id, jsonb_build_object('place', p_place, 'contacted', p_contacted));
  SELECT * INTO c FROM public.arcade_contests WHERE id = p_contest_id;
  RETURN jsonb_build_object('contest', public.arcade_admin_contest_json(c));
END $$;

-- ───────────── grants ─────────────
REVOKE ALL ON FUNCTION public.arcade_contest_status(public.arcade_contests) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_server_key_ok(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_admin_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_contest_ranked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_contest_json(public.arcade_contests, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_admin_contest_json(public.arcade_contests) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_contest_announce(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.arcade_contests_public(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_contest_board(uuid, uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_ticker(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_score_card(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_contest_finalize(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_contests(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_contest_save(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_contest_end(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_contest_announce(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_contest_board(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_admin_winner_update(text, uuid, integer, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.arcade_contests_public(uuid, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_contest_board(uuid, uuid, integer, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_ticker(boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_score_card(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_contest_finalize(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_contests(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_contest_save(text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_contest_end(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_contest_announce(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_contest_board(text, uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_winner_update(text, uuid, integer, boolean, text) TO anon, authenticated, service_role;
