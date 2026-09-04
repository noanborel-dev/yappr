# Supabase — beta backend

Project ref: `nagrmlfkuubeipamxhoe` (from `.mcp.json`).

Nothing here has been applied. These are the commands to run once, in
order. Each is idempotent.

## 1. Schema

Paste both files into the SQL editor, in order, or:

```bash
npx supabase link --project-ref nagrmlfkuubeipamxhoe
npx supabase db push
```

- `0001_beta_schema.sql` — profiles, the allowlist, usage counters, RLS,
  and the sign-up triggers.
- `0002_record_usage.sql` — the atomic counter increment the Edge
  Function calls.

## 2. Auth

Enable the **Email** provider. Nothing else — sign-in is a six-digit OTP,
so there is no OAuth redirect to configure and no `yappr://` protocol
handler to register.

**No Storage bucket.** Nothing in this product stores files.

## 3. Invite the beta testers

```sql
insert into invited_emails (email) values ('someone@example.com');
```

Lowercase, or the constraint rejects the row. Sign-up is refused for
anything not in this table — closed beta is a property of the database,
not of who knows the URL.

## 4. Secrets

```bash
npx supabase secrets set GROQ_API_KEY=gsk_...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
The Groq key must never enter the repo; `.gitignore` already covers
`.env*`.

## 5. Deploy the proxy

```bash
npx supabase functions deploy cleanup
```

Then the desktop client points `groq-sdk` at:

```
https://nagrmlfkuubeipamxhoe.supabase.co/functions/v1/cleanup
```

## What the proxy enforces

| | |
|---|---|
| identity | Supabase JWT, verified server-side |
| burst | 20 requests/minute/user |
| Free weekly cap | 2,000 words, then a 402 the client degrades on |
| global ceiling | ~12M tokens/day, the backstop for everything else |
| select-and-rewrite | Pro only, via the `x-yappr-mode` header |
| revocation | `profiles.revoked`, checked every call |

It never logs a request or response body. Transcripts are counted and
discarded — see the note at the top of `functions/cleanup/index.ts`.

## Before this ships

Confirm Groq's data-retention and training terms in writing. The FAQ
promises text is "never stored, never sold, never used to train
anything"; under BYOK that was the provider's promise to the user, and
behind this proxy it becomes ours.
