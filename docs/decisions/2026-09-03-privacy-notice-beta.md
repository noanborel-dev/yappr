# Is a privacy notice required for the closed beta?

**Decision: yes — but a hosted page is not what satisfies it.**
**Date:** 2026-09-03. Supersedes nothing; implements
`docs/legal-audit-2026-05-17.md` §A for the beta case.

Not legal advice. This records a product decision and its reasoning so
the beta does not ship on an unexamined assumption.

## The trigger already fired

`docs/legal-audit-2026-05-17.md` §A flags "write a real Privacy Policy"
as **HIGH priority**, and named the trigger precisely:

> The moment the `/api/demo` Vercel edge function ships, Yappr becomes a
> GDPR **controller** for audio uploads, IPs and outputs.

That endpoint was never built. **The cleanup proxy is the same trigger
arriving by a different road** — and it is broader, because it runs for
every user on every dictation rather than for anonymous demo traffic.

At beta, Yappr will process:

| Data | Where it goes | Retained? |
|---|---|---|
| Email address | Supabase Auth | yes, until deletion |
| Transcript text | through the proxy to Groq | **no** — never written |
| Word / token counts | Supabase | yes, aggregates only |
| First 60 chars of each transcript | local log only (`pipeline.ts:312`) | on the user's own Mac |
| Audio | nowhere — on-device | never leaves the Mac |

Email address is personal data. That alone makes Yappr a controller.

## Why "later" is the wrong default

GDPR Art. 13 requires the disclosure **at the point of collection**, and
the audit already says so: *"GDPR Art. 13 requires the disclosure itself,
not just the absence of collection."* There is no small-scale exemption
and no beta exemption. Obligation follows the users' location, not the
seller's, so a single tester in the EU or UK is enough.

Apple does **not** force this. Notarized Developer ID distribution has no
privacy-policy requirement — that is an App Store rule, and Yappr is not
shipping there. So the reason to do this is the law, not the store.

## What actually satisfies it for a closed beta

The obligation is to **inform**, not to host a page at a URL. For invited
testers, both of these together are sufficient and cost an afternoon:

1. **A paragraph in the invitation email** — who is processing, what,
   why, for how long, and how to get it deleted.
2. **A disclosure on the sign-in screen**, before the email is submitted.

That covers Art. 13 at the moment of collection, which a page nobody
reads at a URL nobody visits does not do any better.

## What is still needed before public launch

- A real notice at `yappr.app/privacy`. The footer links currently point
  at `href="#"` (audit §A).
- **A legal entity.** Audit §248: the notice needs a controller name and
  address. Without an LLC/Ltd this is a personal name and a home address.
  This is the long pole, and it is a decision, not a task.
- Terms of Service.

## Copy that must change with it

- **Audit §H's suggested onboarding line is now stale.** It proposes
  *"sent only to the provider you choose... never reaches Yappr
  servers."* Under a subscription there is no provider to choose, and
  transcripts do reach our servers. Writing it would create exactly the
  false claim `docs/ARCHITECTURE.md` forbids.
- **Audit §G's key-storage disclosure becomes moot.** Removing
  `provider.groqKey` removes the plaintext key it asks us to disclose.
  Deleting BYOK deletes an obligation.
- **Audit §G's log disclosure still stands.** The 60-character transcript
  excerpt is local-only but undisclosed, and must be named.

## Decision

Ship the beta with the in-app + invitation disclosure. Do not block the
beta on a hosted page. Do not reach public launch without one, and start
the legal-entity decision now because it gates the notice, not the code.
