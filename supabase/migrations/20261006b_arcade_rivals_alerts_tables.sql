-- arcade_rivals_alerts: top-N boards, challenge entries, rivalries, seed tickets,
-- in-app alerts, web push subscriptions + log, server-key-gated push queue.
-- Additive only (new arcade_* tables/functions, new nullable columns on arcade_* tables).

-- ── columns on existing arcade tables ──
ALTER TABLE public.arcade_scores ADD COLUMN IF NOT EXISTS run_id uuid NULL;
CREATE UNIQUE INDEX IF NOT EXISTS arcade_scores_player_run_key
  ON public.arcade_scores (player_id, run_id) WHERE run_id IS NOT NULL;

ALTER TABLE public.arcade_challenges
  ADD COLUMN IF NOT EXISTS opponent_player_id uuid NULL REFERENCES public.arcade_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_challenge_id text NULL REFERENCES public.arcade_challenges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creator_score_id uuid NULL REFERENCES public.arcade_scores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS arcade_challenges_opponent_idx ON public.arcade_challenges (opponent_player_id);
CREATE INDEX IF NOT EXISTS arcade_challenges_parent_idx ON public.arcade_challenges (parent_challenge_id);
CREATE INDEX IF NOT EXISTS arcade_challenges_creator_score_idx ON public.arcade_challenges (creator_score_id);
CREATE INDEX IF NOT EXISTS arcade_challenges_creator_created_idx ON public.arcade_challenges (creator_player_id, created_at DESC);

-- ── boards (data-driven per game) ──
CREATE TABLE IF NOT EXISTS public.arcade_boards (
  game_id text PRIMARY KEY REFERENCES public.arcade_games(id),
  modes text[] NOT NULL CHECK (cardinality(modes) > 0 AND modes <@ ARRAY['endless','timed60','challenge']::text[]),
  size int NOT NULL DEFAULT 5 CHECK (size BETWEEN 1 AND 25),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.arcade_boards (game_id, modes, size, label) VALUES
  ('court-vision', ARRAY['timed60','challenge'], 5, '60s'),
  ('fifth-run', ARRAY['endless','timed60'], 5, 'Endless')
ON CONFLICT (game_id) DO NOTHING;

-- ── challenge entries (one per player per challenge) ──
CREATE TABLE IF NOT EXISTS public.arcade_challenge_entries (
  challenge_id text NOT NULL REFERENCES public.arcade_challenges(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('creator','challenger')),
  status text NOT NULL CHECK (status IN ('started','finished')),
  score int NULL CHECK (score IS NULL OR score >= 0),
  score_id uuid NULL REFERENCES public.arcade_scores(id) ON DELETE SET NULL,
  result text NULL CHECK (result IS NULL OR result IN ('win','loss','tie')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  PRIMARY KEY (challenge_id, player_id)
);
CREATE INDEX IF NOT EXISTS arcade_challenge_entries_player_idx ON public.arcade_challenge_entries (player_id, started_at DESC);
CREATE INDEX IF NOT EXISTS arcade_challenge_entries_score_idx ON public.arcade_challenge_entries (score_id);

-- ── rivalries (one row per unordered pair per game) ──
CREATE TABLE IF NOT EXISTS public.arcade_rivalries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.arcade_games(id),
  player_lo uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  player_hi uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  lo_wins int NOT NULL DEFAULT 0 CHECK (lo_wins >= 0),
  hi_wins int NOT NULL DEFAULT 0 CHECK (hi_wins >= 0),
  ties int NOT NULL DEFAULT 0 CHECK (ties >= 0),
  last_challenge_id text NULL REFERENCES public.arcade_challenges(id) ON DELETE SET NULL,
  last_winner_id uuid NULL,
  last_lo_score int NULL,
  last_hi_score int NULL,
  last_played_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (player_lo < player_hi),
  UNIQUE (game_id, player_lo, player_hi)
);
CREATE INDEX IF NOT EXISTS arcade_rivalries_lo_idx ON public.arcade_rivalries (player_lo);
CREATE INDEX IF NOT EXISTS arcade_rivalries_hi_idx ON public.arcade_rivalries (player_hi);
CREATE INDEX IF NOT EXISTS arcade_rivalries_last_challenge_idx ON public.arcade_rivalries (last_challenge_id);

-- ── seed tickets: server-issued seed for a "set the bar" / rematch run ──
CREATE TABLE IF NOT EXISTS public.arcade_seed_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  game_id text NOT NULL REFERENCES public.arcade_games(id),
  seed text NOT NULL,
  opponent_player_id uuid NULL REFERENCES public.arcade_players(id) ON DELETE SET NULL,
  parent_challenge_id text NULL REFERENCES public.arcade_challenges(id) ON DELETE SET NULL,
  challenge_id text NULL REFERENCES public.arcade_challenges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS arcade_seed_tickets_player_idx ON public.arcade_seed_tickets (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arcade_seed_tickets_opponent_idx ON public.arcade_seed_tickets (opponent_player_id);
CREATE INDEX IF NOT EXISTS arcade_seed_tickets_parent_idx ON public.arcade_seed_tickets (parent_challenge_id);
CREATE INDEX IF NOT EXISTS arcade_seed_tickets_challenge_idx ON public.arcade_seed_tickets (challenge_id);
CREATE INDEX IF NOT EXISTS arcade_seed_tickets_game_idx ON public.arcade_seed_tickets (game_id);

-- ── alerts (inbox) ──
CREATE TABLE IF NOT EXISTS public.arcade_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  actor_player_id uuid NULL REFERENCES public.arcade_players(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('rival_started','rival_finished','your_turn')),
  challenge_id text NULL REFERENCES public.arcade_challenges(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '/arcade',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  push_status text NOT NULL DEFAULT 'none'
    CHECK (push_status IN ('none','pending','sending','sent','failed','throttled','no_subscription')),
  push_attempted_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS arcade_alerts_player_idx ON public.arcade_alerts (player_id, id DESC);
CREATE INDEX IF NOT EXISTS arcade_alerts_pending_idx ON public.arcade_alerts (created_at) WHERE push_status = 'pending';
CREATE INDEX IF NOT EXISTS arcade_alerts_actor_idx ON public.arcade_alerts (actor_player_id);
CREATE INDEX IF NOT EXISTS arcade_alerts_challenge_idx ON public.arcade_alerts (challenge_id);

-- ── web push ──
CREATE TABLE IF NOT EXISTS public.arcade_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1024),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 100),
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz NULL,
  failure_count int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS arcade_push_subscriptions_player_idx ON public.arcade_push_subscriptions (player_id);

CREATE TABLE IF NOT EXISTS public.arcade_push_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id bigint NULL REFERENCES public.arcade_alerts(id) ON DELETE SET NULL,
  subscription_id uuid NULL REFERENCES public.arcade_push_subscriptions(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('sent','failed','gone','throttled','dry_run')),
  http_status int NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arcade_push_log_alert_idx ON public.arcade_push_log (alert_id);
CREATE INDEX IF NOT EXISTS arcade_push_log_sub_idx ON public.arcade_push_log (subscription_id);

-- Server keys (sha256 only) gate push-queue RPCs to our API.
CREATE TABLE IF NOT EXISTS public.arcade_server_keys (
  name text PRIMARY KEY,
  key_hash text NOT NULL CHECK (char_length(key_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['arcade_boards','arcade_challenge_entries','arcade_rivalries','arcade_seed_tickets',
    'arcade_alerts','arcade_push_subscriptions','arcade_push_log','arcade_server_keys'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t || '_deny_all', t);
  END LOOP;
END $$;

