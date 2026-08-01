# Yappr

**Voice dictation for macOS. Bring your own API key.**

> Press and hold a hotkey, speak, release — your cleaned-up text appears wherever your cursor is. No subscription. No account. No screenshots.

---

## Features

- **Push-to-talk** — hold Right Option (⌥) anywhere in the OS, speak, release. Done.
- **Instant on short phrases** — anything under 8 words skips the cleanup model entirely and pastes in roughly a tenth of a second.
- **On-device transcription** — NVIDIA Parakeet or whisper.cpp, running locally. Your audio doesn't leave the Mac to be transcribed.
- **Context-aware cleanup** — detects Slack, Gmail, VS Code, Notion and adjusts tone automatically
- **Prompt shaping** — dictating at an AI coding agent produces a well-structured prompt instead of a raw transcript
- **Command mode** — highlight text, hold ⌘⇧Space, dictate an edit ("make this a bullet list")
- **Dev mode** — preserves camelCase, snake_case, file paths, jargon in coding apps
- **Multilingual** — switch language mid-sentence; a French clause inside an English sentence comes back in French
- **Pauses your music** — Music and Spotify pause while you dictate, then resume
- **Clipboard fallback** — if auto-paste isn't available, text is copied with a ⌘V reminder

## How it works

Your audio goes **mic → on-device model → your cursor**. Yappr's servers are never in the path.

Transcription runs locally. The optional cleanup pass — the step that strips filler, fixes casing and matches the tone of the app you're writing in — is a single call to your own API key, and it's skipped entirely for short dictations.

### Speed

Transcription is on-device, and the model tier is the whole story. Measured on an M5 Pro:

| tier | model | 1s clip | 7s clip | size |
|---|---|---|---|---|
| **Instant** | Parakeet TDT 0.6B | **24 ms** | **64 ms** | 339 MB |
| Fast | whisper base | 55 ms | 86 ms | 57 MB |
| Balanced | whisper small | 170 ms | 245 ms | 181 MB |
| Accurate | whisper large-v3-turbo | 825 ms | 870 ms | 547 MB |

Whisper pads every clip to a 30-second window internally, so its cost barely moves with clip length — a one-second phrase costs about the same as a twenty-second one. Parakeet has no fixed window, so short phrases really are near-instant. That's why Instant is the default tier.

A short dictation on Instant, with cleanup skipped, lands in well under 200 ms end to end.

## Quick start

1. Download the latest build from [yappr.app/download](https://yappr.app/download)
2. Open Yappr — the setup wizard appears
3. Instant is preselected and downloads on first run — or pick another tier, or paste a [Groq API key](https://console.groq.com) to use the cloud
4. Hold **Right Option (⌥)** anywhere and speak

Cleanup is optional. With no API key, Yappr still transcribes on-device and applies its deterministic fixes — brand names, your custom dictionary, spelled-out names, question marks.

## FAQ

**Does it work offline?**
Transcription, always, on every tier. The cleanup pass needs a key — and is skipped for short dictations regardless.

**How much does BYOK actually cost?**
Only the cleanup pass costs anything, and short dictations skip it. Groq's `llama-3.1-8b-instant` is fractions of a cent per call, and most users stay inside the free tier. Transcription is free because it runs on your machine.

**Does Yappr see my screen?**
No. This is an explicit anti-feature. We don't capture screenshots, and we never will.

**Which languages?**
Instant (Parakeet) covers English plus 24 European languages. The whisper tiers cover ~100. All of them handle switching language mid-sentence.

**Why doesn't it always clean up what I said?**
By design. Under 8 words there's nothing worth restructuring, so Yappr pastes your words with only the deterministic fixes applied — and saves you the round-trip.

## Legal

Yappr is a proprietary commercial product. See [LICENSE](LICENSE) for terms and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the open-source components incorporated under their respective licenses.

Built with Llama. Llama 3 is licensed under the Llama 3 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.

Slack, Gmail, iMessage, Notion, Cursor, ChatGPT, Claude, Groq, Llama, NVIDIA, Parakeet, and Whisper are trademarks of their respective owners. Yappr is not affiliated with or endorsed by these companies.
