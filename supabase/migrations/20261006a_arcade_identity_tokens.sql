-- arcade_identity_tokens: device-bound player tokens, display-case handles with
-- case-insensitive uniqueness, reserved/claimable handles, profanity filter.
-- Additive only: new arcade_* tables/functions + one new column/index on arcade_players.

ALTER TABLE public.arcade_players
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS arcade_players_handle_lower_key
  ON public.arcade_players (lower(handle));

-- Hashed per-player secret token (plaintext lives only in the player's localStorage).
CREATE TABLE IF NOT EXISTS public.arcade_player_secrets (
  player_id uuid PRIMARY KEY REFERENCES public.arcade_players(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (char_length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Reserved handles. claim_code_hash = sha256(one-time code); NULL code = not claimable.
CREATE TABLE IF NOT EXISTS public.arcade_reserved_handles (
  handle_lower text PRIMARY KEY CHECK (handle_lower = lower(handle_lower)),
  display_handle text NOT NULL CHECK (display_handle ~ '^[A-Za-z0-9_]{3,16}$'),
  claim_code_hash text NULL CHECK (claim_code_hash IS NULL OR char_length(claim_code_hash) = 64),
  claimed_player_id uuid NULL REFERENCES public.arcade_players(id) ON DELETE SET NULL,
  claimed_at timestamptz NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arcade_reserved_handles_claimed_idx
  ON public.arcade_reserved_handles (claimed_player_id);

ALTER TABLE public.arcade_player_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_reserved_handles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.arcade_player_secrets FROM anon, authenticated;
REVOKE ALL ON TABLE public.arcade_reserved_handles FROM anon, authenticated;
CREATE POLICY arcade_player_secrets_deny_all ON public.arcade_player_secrets
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY arcade_reserved_handles_deny_all ON public.arcade_reserved_handles
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Never-claimable system names.
INSERT INTO public.arcade_reserved_handles (handle_lower, display_handle, note) VALUES
  ('admin','admin','system'), ('administrator','administrator','system'),
  ('moderator','moderator','system'), ('mod','mod','system'),
  ('support','support','system'), ('official','official','system'),
  ('staff','staff','system'), ('system','system','system'),
  ('arcade','arcade','brand'), ('fifthfloor','fifthfloor','brand'),
  ('fifthdimension','fifthdimension','brand'), ('fifthfloorarcade','fifthfloorarcade','brand'),
  ('5dimperial','5dimperial','brand')
ON CONFLICT (handle_lower) DO NOTHING;

-- ── internal helpers (not executable by anon/authenticated) ──

CREATE OR REPLACE FUNCTION public.arcade_sha256(p text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$ SELECT encode(extensions.digest(convert_to(coalesce(p, ''), 'UTF8'), 'sha256'), 'hex') $$;

CREATE OR REPLACE FUNCTION public.arcade_handle_is_clean(p_handle text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  n text;
  t text;
  terms text[] := ARRAY[
    'fuck','fuk','fck','shit','cunt','nigg','niga','faggot','fagg','bitch','whore',
    'slut','rapist','dick','cock','pussy','penis','vagina','porn','nazi','hitler',
    'kike','chink','retard','twat','wank','bastard','asshole','dildo','pedophile',
    'molest','kkk','jizz','tranny'
  ];
BEGIN
  n := lower(coalesce(p_handle, ''));
  n := translate(n, '013457$8', 'oieastsb');
  n := replace(n, '_', '');
  FOREACH t IN ARRAY terms LOOP
    IF position(t IN n) > 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- Validates a requested handle for p_player_id (NULL = new player). Returns the trimmed handle.
CREATE OR REPLACE FUNCTION public.arcade_validate_handle(p_handle text, p_player_id uuid)
RETURNS text LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := trim(coalesce(p_handle, ''));
  v_res public.arcade_reserved_handles%ROWTYPE;
BEGIN
  IF v !~ '^[A-Za-z0-9_]{3,16}$' THEN
    RAISE EXCEPTION 'invalid_handle' USING ERRCODE = '22023';
  END IF;
  IF NOT public.arcade_handle_is_clean(v) THEN
    RAISE EXCEPTION 'handle_not_allowed' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_res FROM public.arcade_reserved_handles WHERE handle_lower = lower(v);
  IF FOUND AND (p_player_id IS NULL OR v_res.claimed_player_id IS DISTINCT FROM p_player_id) THEN
    RAISE EXCEPTION 'handle_reserved' USING ERRCODE = '22023';
  END IF;
  IF lower(v) LIKE 'rookie%' AND v ~ '^[Rr][Oo][Oo][Kk][Ii][Ee][0-9]+$' THEN
    RAISE EXCEPTION 'handle_reserved' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.arcade_players p
    WHERE lower(p.handle) = lower(v) AND (p_player_id IS NULL OR p.id <> p_player_id)
  ) THEN
    RAISE EXCEPTION 'handle_taken' USING ERRCODE = '23505';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_issue_token(p_player_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO public.arcade_player_secrets (player_id, token_hash)
  VALUES (p_player_id, public.arcade_sha256(v_token))
  ON CONFLICT (player_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash, last_seen_at = now();
  RETURN v_token;
END;
$$;

-- Token check used by every write RPC.
CREATE OR REPLACE FUNCTION public.arcade_auth(p_device_id text, p_token text)
RETURNS public.arcade_players LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_hash text;
BEGIN
  IF p_device_id IS NULL OR char_length(trim(p_device_id)) < 8 OR char_length(trim(p_device_id)) > 128 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_player FROM public.arcade_players WHERE device_id = trim(p_device_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT token_hash INTO v_hash FROM public.arcade_player_secrets WHERE player_id = v_player.id;
  IF v_hash IS NULL OR p_token IS NULL OR char_length(p_token) <> 64
     OR v_hash <> public.arcade_sha256(p_token) THEN
    RAISE EXCEPTION 'bad_token' USING ERRCODE = '28000';
  END IF;
  RETURN v_player;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_player_json(p public.arcade_players)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('player_id', p.id, 'handle', p.handle, 'is_guest', p.is_guest, 'created_at', p.created_at)
$$;

-- ── public RPCs ──

-- Create-or-resume a device player. Returns token only when newly issued.
CREATE OR REPLACE FUNCTION public.arcade_session(p_device_id text, p_token text DEFAULT NULL, p_handle text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device text := trim(coalesce(p_device_id, ''));
  v_player public.arcade_players%ROWTYPE;
  v_hash text;
  v_token text := NULL;
  v_handle text;
  v_guest boolean := false;
  i int;
BEGIN
  IF char_length(v_device) < 8 OR char_length(v_device) > 128 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_player FROM public.arcade_players WHERE device_id = v_device;
  IF FOUND THEN
    SELECT token_hash INTO v_hash FROM public.arcade_player_secrets WHERE player_id = v_player.id;
    IF v_hash IS NULL THEN
      -- legacy device player (pre-token): issue its first token
      v_token := public.arcade_issue_token(v_player.id);
    ELSIF p_token IS NULL OR v_hash <> public.arcade_sha256(p_token) THEN
      RAISE EXCEPTION 'bad_token' USING ERRCODE = '28000';
    ELSE
      UPDATE public.arcade_player_secrets SET last_seen_at = now()
      WHERE player_id = v_player.id AND last_seen_at < now() - interval '10 minutes';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.arcade_players WHERE created_at > now() - interval '1 minute') >= 60 THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
    END IF;
    IF p_handle IS NOT NULL AND char_length(trim(p_handle)) > 0 THEN
      v_handle := public.arcade_validate_handle(p_handle, NULL);
    ELSE
      v_guest := true;
      FOR i IN 1..25 LOOP
        v_handle := 'Rookie' || CASE WHEN i < 20
          THEN lpad((floor(random() * 10000))::int::text, 4, '0')
          ELSE substr(md5(random()::text), 1, 8) END;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.arcade_players p WHERE lower(p.handle) = lower(v_handle));
      END LOOP;
    END IF;
    INSERT INTO public.arcade_players (handle, device_id, is_guest)
    VALUES (v_handle, v_device, v_guest)
    RETURNING * INTO v_player;
    v_token := public.arcade_issue_token(v_player.id);
  END IF;

  RETURN public.arcade_player_json(v_player) || jsonb_build_object('token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_set_handle(p_device_id text, p_token text, p_handle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_handle text;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  v_handle := public.arcade_validate_handle(p_handle, v_player.id);
  UPDATE public.arcade_players SET handle = v_handle, is_guest = false
  WHERE id = v_player.id RETURNING * INTO v_player;
  RETURN public.arcade_player_json(v_player);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'handle_taken' USING ERRCODE = '23505';
END;
$$;

-- One-time claim of a reserved handle; binds it to the calling device player.
CREATE OR REPLACE FUNCTION public.arcade_claim_handle(p_device_id text, p_token text, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_res public.arcade_reserved_handles%ROWTYPE;
  v_code text := trim(coalesce(p_code, ''));
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  IF char_length(v_code) < 16 OR char_length(v_code) > 128 THEN
    RAISE EXCEPTION 'invalid_claim_code' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_res FROM public.arcade_reserved_handles
  WHERE claim_code_hash = public.arcade_sha256(v_code) AND claimed_player_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_claim_code' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_players p WHERE lower(p.handle) = v_res.handle_lower AND p.id <> v_player.id) THEN
    RAISE EXCEPTION 'handle_conflict' USING ERRCODE = '23505';
  END IF;
  UPDATE public.arcade_players SET handle = v_res.display_handle, is_guest = false
  WHERE id = v_player.id RETURNING * INTO v_player;
  UPDATE public.arcade_reserved_handles
  SET claimed_player_id = v_player.id, claimed_at = now(), claim_code_hash = NULL
  WHERE handle_lower = v_res.handle_lower;
  RETURN public.arcade_player_json(v_player) || jsonb_build_object('claimed', v_res.display_handle);
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_sha256(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_handle_is_clean(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_validate_handle(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_issue_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_auth(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_player_json(public.arcade_players) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.arcade_session(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_set_handle(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_claim_handle(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_session(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_set_handle(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_claim_handle(text, text, text) TO anon, authenticated, service_role;
