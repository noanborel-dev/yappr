// The cleanup proxy.
//
// Design of record: docs/superpowers/specs/2026-08-31-hosted-inference-beta-design.md
// Tiers: docs/ARCHITECTURE.md
//
// The client points groq-sdk's baseURL here and sends its Supabase access
// token where the provider key used to go. This endpoint is wire-
// compatible with /openai/v1/chat/completions so every retry path, 429
// handler and error mapping in the desktop app keeps working untouched.
//
// TWO RULES THIS FILE ENFORCES, both of which are promises made elsewhere:
//
//  1. NO TRANSCRIPT IS EVER LOGGED OR STORED. The FAQ says text is "never
//     stored, never sold, never used to train anything", and behind this
//     proxy that is our promise rather than the provider's. Words are
//     counted and discarded. The Supabase relay example in the docs does
//     console.log(e.data) — doing that here puts user transcripts in the
//     platform logs and breaks the promise. Log counts and status codes.
//
//  2. A CLIENT CANNOT GRANT ITSELF A PLAN. profiles.state is read with
//     the service role and written only by the Paddle webhook. The token
//     proves identity; it says nothing about entitlement.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Abuse ceilings. Free is deliberately NOT metered on volume beyond the
// weekly word cap — docs/pricing-and-economics.md found metering it cost
// conversion without saving meaningful money — so these exist to catch
// machines, not to shape the product.
const BURST_PER_MINUTE = 20          // ~3x the fastest sustained human rate
const FREE_WORDS_PER_WEEK = 2000     // mirrors FREE_WEEKLY_WORD_LIMIT
const GLOBAL_DAILY_TOKENS = 12_000_000  // ~$5/day at gpt-oss-20b pricing

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

/** ISO week, server-side. A client clock cannot buy extra words. */
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((t.getTime() - jan1.getTime()) / 86_400_000) + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Words in the user-authored parts of the request.
 *
 * Counted from the payload in memory and never written anywhere. Only
 * `user` role content counts: the system prompt is ours and charging the
 * user for our own template would make the cap depend on prompt length
 * rather than on how much they actually said.
 */
function countRequestWords(body: unknown): number {
  const messages = (body as { messages?: Array<{ role?: string; content?: unknown }> })?.messages
  if (!Array.isArray(messages)) return 0
  let words = 0
  for (const m of messages) {
    if (m?.role !== 'user' || typeof m.content !== 'string') continue
    words += m.content.trim().split(/\s+/).filter(Boolean).length
  }
  return words
}

function deny(status: number, code: string, message: string): Response {
  // Shaped like an OpenAI/Groq error so the SDK surfaces it as an APIError
  // and the client's existing catch falls back to the raw transcript.
  return new Response(
    JSON.stringify({ error: { message, type: 'yappr_error', code } }),
    { status, headers: { 'content-type': 'application/json' } },
  )
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method_not_allowed', 'POST only.')

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return deny(401, 'no_token', 'Missing credentials.')

  const { data: auth, error: authErr } = await admin.auth.getUser(jwt)
  if (authErr || !auth?.user) return deny(401, 'bad_token', 'Not signed in.')
  const userId = auth.user.id

  const { data: profile } = await admin
    .from('profiles')
    .select('state, revoked')
    .eq('user_id', userId)
    .single()

  if (!profile) return deny(403, 'no_profile', 'No entitlement on file.')
  if (profile.revoked) return deny(403, 'revoked', 'This account has been disabled.')

  const isFree = profile.state === 'free'
  const now = new Date()

  // Burst guard. Catches a runaway client loop; no human reaches it.
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString()
  const { data: burst } = await admin
    .from('usage_minute')
    .select('requests')
    .eq('user_id', userId)
    .eq('bucket', minute)
    .maybeSingle()
  if ((burst?.requests ?? 0) >= BURST_PER_MINUTE) {
    return deny(429, 'rate_limited', 'Too many requests. Try again shortly.')
  }

  // The only protection against a failure class nobody thought of. Bounds
  // worst case regardless of user count or a leaked token.
  const today = now.toISOString().slice(0, 10)
  const { data: globalDay } = await admin
    .from('usage_day_global')
    .select('tokens')
    .eq('day', today)
    .maybeSingle()
  if ((globalDay?.tokens ?? 0) >= GLOBAL_DAILY_TOKENS) {
    return deny(429, 'capacity', 'Service is at capacity today.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return deny(400, 'bad_body', 'Malformed request.')
  }

  // Select-and-rewrite is Pro. It is a distinct request MODE, which is the
  // one entitlement the server can see cheaply — the fact cap cannot be
  // enforced here because remembered facts never leave the user's machine
  // (see ARCHITECTURE.md). The client sends this header; a tampered client
  // that omits it still cannot get the feature, because the desktop UI is
  // what invokes it.
  if (isFree && req.headers.get('x-yappr-mode') === 'rewrite') {
    return deny(402, 'pro_feature', 'Select-and-rewrite is a Pro feature.')
  }

  const words = countRequestWords(body)
  const week = isoWeek(now)

  if (isFree) {
    const { data: weekRow } = await admin
      .from('usage_week')
      .select('words')
      .eq('user_id', userId)
      .eq('iso_week', week)
      .maybeSingle()
    if ((weekRow?.words ?? 0) >= FREE_WORDS_PER_WEEK) {
      // Over-cap is a DOWNGRADE, not a wall: the client falls back to
      // local cleanup plus the deterministic passes, and dictation keeps
      // working. A blocked hotkey would read as a broken app.
      return deny(402, 'weekly_cap', 'Weekly cleanup limit reached.')
    }
  }

  const upstream = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()

  // Usage accounting, counts only. Deliberately after the response is in
  // hand and deliberately not awaited-on-failure: a metering hiccup must
  // not cost the user a dictation they already paid latency for.
  if (upstream.ok) {
    let tokens = 0
    try {
      tokens = JSON.parse(text)?.usage?.total_tokens ?? 0
    } catch { /* usage is a nicety; the reply is not */ }
    admin.rpc('record_usage', {
      p_user: userId, p_minute: minute, p_week: week, p_day: today,
      p_words: words, p_tokens: tokens,
    }).then(
      () => {},
      (e: unknown) => console.error('usage accounting failed', String(e)),
    )
  }

  // Passed through verbatim so the SDK sees exactly what Groq said —
  // including a real 429, which the client's CLEANUP_RETRY_CAP_MS logic
  // already knows how to read.
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  })
})
