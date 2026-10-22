-- v33: additive real-device perf telemetry for Fifth Glide (opt-in ?perf=1 + 10% sampled).
-- Write-only for clients via a SECURITY DEFINER RPC; no direct table access (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.arcade_perf_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  game_id text NOT NULL DEFAULT 'fifth-run',
  build text,
  opted boolean NOT NULL DEFAULT false,
  ua text,
  summary jsonb NOT NULL
);
ALTER TABLE public.arcade_perf_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS arcade_perf_logs_created_idx ON public.arcade_perf_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.arcade_perf_log(p_game_id text, p_build text, p_opted boolean, p_ua text, p_summary jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_summary IS NULL OR jsonb_typeof(p_summary) <> 'object' OR length(p_summary::text) > 60000 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  INSERT INTO arcade_perf_logs (game_id, build, opted, ua, summary)
  VALUES (left(coalesce(p_game_id, 'fifth-run'), 40), left(p_build, 80), coalesce(p_opted, false), left(p_ua, 300), p_summary);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.arcade_perf_log(text, text, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_perf_log(text, text, boolean, text, jsonb) TO anon, authenticated;
