-- Usage accounting, as ONE atomic call.
--
-- The Edge Function increments three counters after every proxied
-- cleanup. Three separate round trips from Deno would be three chances to
-- half-record a request, and would put ~3x the latency on a path the user
-- is waiting behind. One RPC is atomic and is one hop.
--
-- Counts only. No column here can hold user text, which is what makes
-- "never stored" a property of the shape rather than a discipline.
create or replace function public.record_usage(
  p_user   uuid,
  p_minute timestamptz,
  p_week   text,
  p_day    date,
  p_words  integer,
  p_tokens bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_minute (user_id, bucket, requests)
    values (p_user, p_minute, 1)
    on conflict (user_id, bucket)
      do update set requests = public.usage_minute.requests + 1;

  insert into public.usage_week (user_id, iso_week, words)
    values (p_user, p_week, greatest(p_words, 0))
    on conflict (user_id, iso_week)
      do update set words = public.usage_week.words + greatest(p_words, 0);

  insert into public.usage_day_global (day, tokens)
    values (p_day, greatest(p_tokens, 0))
    on conflict (day)
      do update set tokens = public.usage_day_global.tokens + greatest(p_tokens, 0);
end;
$$;

-- security definer means this runs as its owner, so it must not be
-- callable by a signed-in client — that would let anyone inflate or reset
-- their own counters. The Edge Function calls it with the service role.
revoke execute on function public.record_usage(uuid, timestamptz, text, date, integer, bigint) from public;
revoke execute on function public.record_usage(uuid, timestamptz, text, date, integer, bigint) from anon;
revoke execute on function public.record_usage(uuid, timestamptz, text, date, integer, bigint) from authenticated;
