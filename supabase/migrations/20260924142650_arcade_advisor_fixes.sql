-- ---------------------------------------------------------------------------
-- arcade_advisor_fixes (applied separately as migration arcade_advisor_fixes)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS arcade_challenges_creator_player_id_idx
  ON public.arcade_challenges (creator_player_id);

CREATE INDEX IF NOT EXISTS arcade_challenges_game_id_idx
  ON public.arcade_challenges (game_id);

CREATE INDEX IF NOT EXISTS arcade_contests_game_id_idx
  ON public.arcade_contests (game_id);

CREATE INDEX IF NOT EXISTS arcade_scores_game_id_idx
  ON public.arcade_scores (game_id);

DROP POLICY IF EXISTS arcade_games_select_public ON public.arcade_games;
DROP POLICY IF EXISTS arcade_contests_select_public ON public.arcade_contests;
DROP POLICY IF EXISTS arcade_challenges_select_public ON public.arcade_challenges;

REVOKE ALL ON TABLE public.arcade_games FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_contests FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_players FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_scores FROM anon, authenticated;

CREATE POLICY arcade_players_deny_all
  ON public.arcade_players FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY arcade_scores_deny_all
  ON public.arcade_scores FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY arcade_games_deny_all
  ON public.arcade_games FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY arcade_contests_deny_all
  ON public.arcade_contests FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY arcade_challenges_deny_all
  ON public.arcade_challenges FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

GRANT ALL ON TABLE public.arcade_players TO service_role;
GRANT ALL ON TABLE public.arcade_games TO service_role;
GRANT ALL ON TABLE public.arcade_scores TO service_role;
GRANT ALL ON TABLE public.arcade_challenges TO service_role;
GRANT ALL ON TABLE public.arcade_contests TO service_role;
