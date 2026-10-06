-- Giveaway contests v2: extend arcade_contests additively, add winners + admin audit log,
-- and allow the 'contest_won' alert kind.

ALTER TABLE public.arcade_contests
  ADD COLUMN IF NOT EXISTS prize_image_url text NULL,
  ADD COLUMN IF NOT EXISTS rules_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS how_to_claim text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS winner_count smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auto_announce boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ended_early_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS winners_announced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.arcade_contests
  ADD CONSTRAINT arcade_contests_title_len CHECK (char_length(title) BETWEEN 3 AND 80),
  ADD CONSTRAINT arcade_contests_prize_len CHECK (char_length(prize_text) <= 200),
  ADD CONSTRAINT arcade_contests_prize_image_url_chk CHECK (
    prize_image_url IS NULL OR (prize_image_url ~ '^https://[^\s"''<>]+$' AND char_length(prize_image_url) <= 600)),
  ADD CONSTRAINT arcade_contests_rules_len CHECK (char_length(rules_text) <= 4000),
  ADD CONSTRAINT arcade_contests_claim_len CHECK (char_length(how_to_claim) <= 500),
  ADD CONSTRAINT arcade_contests_winner_count_chk CHECK (winner_count BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS arcade_contests_due_idx
  ON public.arcade_contests (ends_at) WHERE winners_announced_at IS NULL AND is_active;

CREATE TABLE IF NOT EXISTS public.arcade_contest_winners (
  contest_id uuid NOT NULL REFERENCES public.arcade_contests(id) ON DELETE CASCADE,
  place smallint NOT NULL CHECK (place BETWEEN 1 AND 5),
  player_id uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  handle text NOT NULL,
  score integer NOT NULL,
  score_id uuid NULL REFERENCES public.arcade_scores(id) ON DELETE SET NULL,
  claim_code text NOT NULL,
  alert_id bigint NULL REFERENCES public.arcade_alerts(id) ON DELETE SET NULL,
  contacted_at timestamptz NULL,
  admin_note text NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, place),
  UNIQUE (contest_id, player_id)
);
CREATE INDEX IF NOT EXISTS arcade_contest_winners_player_idx ON public.arcade_contest_winners (player_id);
CREATE INDEX IF NOT EXISTS arcade_contest_winners_score_idx ON public.arcade_contest_winners (score_id);
CREATE INDEX IF NOT EXISTS arcade_contest_winners_alert_idx ON public.arcade_contest_winners (alert_id);

CREATE TABLE IF NOT EXISTS public.arcade_admin_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL CHECK (char_length(action) <= 40),
  contest_id uuid NULL REFERENCES public.arcade_contests(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arcade_admin_log_contest_idx ON public.arcade_admin_log (contest_id);

-- Lock down like every other arcade table.
ALTER TABLE public.arcade_contest_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_admin_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY arcade_contest_winners_deny_all ON public.arcade_contest_winners AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY arcade_admin_log_deny_all ON public.arcade_admin_log AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.arcade_contest_winners FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_admin_log FROM anon, authenticated;

-- Widen the alert kinds (arcade-owned constraint).
ALTER TABLE public.arcade_alerts DROP CONSTRAINT arcade_alerts_kind_check;
ALTER TABLE public.arcade_alerts ADD CONSTRAINT arcade_alerts_kind_check
  CHECK (kind = ANY (ARRAY['rival_started', 'rival_finished', 'your_turn', 'contest_won']));
