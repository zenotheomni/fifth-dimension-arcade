-- Legacy device-id-only RPCs are superseded by token-checked arcade_session / arcade_submit_run /
-- arcade_challenge_* RPCs. Keep the functions (no drops), but remove client access.
REVOKE EXECUTE ON FUNCTION public.arcade_register_player(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_submit_score(text, text, integer, jsonb, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_create_challenge(text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_get_challenge(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_personal_best(text, text, text) FROM PUBLIC, anon, authenticated;
