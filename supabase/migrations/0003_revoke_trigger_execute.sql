-- Trigger functions have no business being callable over the REST API.
--
-- Flagged by the Supabase security advisor immediately after 0001 was
-- applied: both functions are SECURITY DEFINER and were reachable at
-- /rest/v1/rpc/<name> by the anon and authenticated roles.
--
-- Neither is directly exploitable — each references `new`, which does not
-- exist outside a trigger, so a direct call errors — but a SECURITY
-- DEFINER function sitting on the public API is a foothold that costs
-- nothing to remove.
--
-- A trigger executes as the table owner, so revoking EXECUTE does not
-- affect the triggers themselves. record_usage was already revoked in
-- 0002; this closes the two that were missed there.
revoke execute on function public.enforce_beta_allowlist() from public;
revoke execute on function public.enforce_beta_allowlist() from anon;
revoke execute on function public.enforce_beta_allowlist() from authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- NOT revoked, deliberately: public.rls_auto_enable() shows the same
-- advisor warning and is Supabase's own. It is an event trigger that
-- auto-enables RLS on new tables in `public`, returns `event_trigger`,
-- and therefore cannot be invoked through PostgREST at all — the warning
-- is a false positive there. Revoking on a platform-managed function
-- would risk breaking the safety net for no gain.
