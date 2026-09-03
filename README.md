# Yappr

**Voice dictation for macOS. Bring your own API key.**

> Press and hold a hotkey, speak, release — your cleaned-up text appears wherever your cursor is. No subscription. No account. No screenshots.

---

## Features

- **Push-to-talk** — hold Right Option (⌥) anywhere in the OS, speak, release. Done.
- **Instant on short phrases** — anything under 8 words skips the cleanup model entirely and pastes in roughly a tenth of a second.
- **On-device transcription** — NVIDIA Parakeet, running locally. Your audio doesn't leave the Mac to be transcribed.
- **Context-aware cleanup** — detects Slack, Gmail, VS Code, Notion and adjusts tone automatically
- **Prompt shaping** — dictating at an AI coding agent produces a well-structured prompt instead of a raw transcript
- **Command mode** — highlight text, hold ⌘⇧Space, dictate an edit ("make this a bullet list")
- **Dev mode** — preserves camelCase, snake_case, file paths, jargon in coding apps
- **Multilingual** — switch language mid-sentence; a French clause inside an English sentence comes back in French
- **Pauses your music** — Music and Spotify pause while you dictate, then resume
- **Clipboard fallback** — if auto-paste isn't available, text is copied with a ⌘V reminder

## How it works

Your audio goes **mic → on-device model → your cursor**. Your voice never leaves your Mac.

Transcription runs locally. The optional cleanup pass — the step that strips filler, fixes casing and matches the tone of the app you're writing in — is a single call to your own API key, and it's skipped entirely for short dictations.

### Speed

One on-device model: NVIDIA Parakeet TDT 0.6B (339 MB). Measured on an M5 Pro:

| audio | transcription |
|---|---|
| 1s | **24 ms** |
| 4s | 48 ms |
| 7s | 64 ms |
| 16s | 164 ms |

Cost scales with how long you spoke. Yappr previously offered whisper tiers as well, and dropped them: whisper pads every clip to a 30-second window internally, so its fastest useful tier still cost ~170 ms and its most accurate cost ~870 ms — for a one-second phrase. Parakeet was faster than all of them at matching English quality, so keeping four models only bought confusion.

A short dictation, with cleanup skipped, lands in well under 200 ms end to end.

## Quick start

1. Download the latest build from [yappr.app/download](https://yappr.app/download)
2. Open Yappr — the setup wizard appears
3. The on-device model downloads on first run (339 MB) — or paste a [Groq API key](https://console.groq.com) to use the cloud instead
4. Hold **Right Option (⌥)** anywhere and speak

Cleanup is optional. With no API key, Yappr still transcribes on-device and applies its deterministic fixes — brand names, your custom dictionary, spelled-out names, question marks.

## FAQ

**Does it work offline?**
Transcription, always. The cleanup pass needs a key — and is skipped for short dictations regardless.

**How much does BYOK actually cost?**
Only the cleanup pass costs anything, and short dictations skip it. Groq's `llama-3.1-8b-instant` is fractions of a cent per call, and most users stay inside the free tier. Transcription is free because it runs on your machine.

**Does Yappr see my screen?**
No. This is an explicit anti-feature. We don't capture screenshots, and we never will.

**Which languages?**
English plus 24 European languages, including switching between them mid-sentence. Languages outside that set need the Groq cloud provider, which uses Whisper.

**Why doesn't it always clean up what I said?**
By design. Under 8 words there's nothing worth restructuring, so Yappr pastes your words with only the deterministic fixes applied — and saves you the round-trip.

## Legal

Yappr is a proprietary commercial product. See [LICENSE](LICENSE) for terms and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the open-source components incorporated under their respective licenses.

Slack, Gmail, iMessage, Notion, Cursor, ChatGPT, Claude, Groq, OpenAI, NVIDIA, Parakeet, and Whisper are trademarks of their respective owners. Yappr is not affiliated with or endorsed by these companies.
