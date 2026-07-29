export type UserErrorCode =
  | 'NO_KEY'
  | 'NETWORK'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TRANSCRIBE_FAILED'
  | 'NO_SPEECH'

export type UserError = {
  code: UserErrorCode
  userMessage: string
  // Would running the SAME audio again plausibly succeed? Drives the
  // durable retry queue in index.ts:
  //   'retry'  → schedule a background retry with backoff
  //   'park'   → keep the audio, but don't spin; the user must fix
  //              something first (add a key, fix auth)
  //   'drop'   → terminal, delete the audio; a replay can only produce
  //              the identical result
  disposition: 'retry' | 'park' | 'drop'
}

// Sentinel error thrown by the pipeline when Whisper returns an empty
// (or near-empty / hallucinated) transcript. Caught by the indicator
// flow so we surface a friendly message instead of pasting nothing.
export class NoSpeechError extends Error {
  constructor() {
    super('No speech detected')
    this.name = 'NoSpeechError'
  }
}

const NETWORK_HINTS = ['fetch failed', 'ENOTFOUND', 'ECONNREFUSED', 'getaddrinfo', 'ETIMEDOUT']
const AUTH_HINTS = ['401', 'Invalid API Key', 'invalid_api_key', 'Incorrect API key']
const RATE_LIMIT_HINTS = ['429', 'rate_limit_exceeded', 'Rate limit reached']

export function toUserError(err: unknown): UserError {
  if (err instanceof NoSpeechError) {
    // Terminal by construction: the same audio will always transcribe to
    // the same nothing, so replaying it just burns cycles.
    return { code: 'NO_SPEECH', userMessage: "couldn't hear you — try again", disposition: 'drop' }
  }
  const raw = err instanceof Error ? err.message : String(err)

  if (!raw || raw.toLowerCase().includes('no api key')) {
    return { code: 'NO_KEY', userMessage: 'Add your Groq key in Settings.', disposition: 'park' }
  }
  // Auth and rate-limit both mention 401/429-adjacent strings, so check the
  // narrower rate-limit hints first.
  if (RATE_LIMIT_HINTS.some(h => raw.includes(h))) {
    return { code: 'RATE_LIMIT', userMessage: 'Rate limited — retrying.', disposition: 'retry' }
  }
  if (NETWORK_HINTS.some(h => raw.includes(h))) {
    return { code: 'NETWORK', userMessage: "Couldn't reach Groq. Check your connection.", disposition: 'retry' }
  }
  if (AUTH_HINTS.some(h => raw.includes(h))) {
    return { code: 'AUTH', userMessage: 'Groq key rejected. Update it in Settings.', disposition: 'park' }
  }
  // Catch-all. This is where the dominant real-world failure lands — the
  // whisper worker exiting with `code: null` mid-transcription — and a
  // respawned worker usually succeeds, so it is worth retrying.
  return { code: 'TRANSCRIBE_FAILED', userMessage: 'Transcription failed — retrying…', disposition: 'retry' }
}
