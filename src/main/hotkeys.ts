import { GlobalKeyboardListener } from 'node-global-key-listener'
import { HOTKEY_TIMING } from '../shared/constants'

type Callbacks = {
  onStart: () => void
  onStop: () => void
  onAbort: () => void          // recording in progress should be discarded
  onPasteLast: () => void      // double-tap: paste most recent dictation
}

// Module-level state. Only one hotkey active at a time.
let listener: GlobalKeyboardListener | null = null
let currentKey: string | null = null
let callbacks: Callbacks | null = null

// Interaction state machine state.
//
// Three behaviors on the same key:
//  - HOLD: press + hold => record while held; release stops.
//  - SINGLE TAP (toggle): tap once, recording stays on until next press.
//  - DOUBLE TAP: two presses within dblTapWindowMs => paste last
//    transcription. The indicator pill never lights up — clean paste,
//    no flicker.
//
// The trick: we DEFER firing fireStart() by HOTKEY_TIMING.startDelayMs
// (~180ms) after DOWN. During that window:
//   - If a second DOWN arrives → it's a double-tap. Cancel the
//     deferred start (pill never lit). Fire onPasteLast on the second
//     UP (after the modifier key is physically released, so injecting
//     ⌘V doesn't produce ⌃⌘V).
//   - If UP arrives → it was a quick tap. Fire fireStart NOW
//     (recording becomes live, tap-toggle mode entered).
//   - If the window expires with key still held → it's a hold. Fire
//     fireStart NOW, recording becomes live, release will stop it.
// In all three cases the user perceives the recording starting at
// the moment that disambiguates their intent. Hold feels instant
// (the 180ms is invisible because they're still pressing). Tap
// feels instant on release. Double-tap never shows the pill.
let pressedAt = 0      // timestamp of current keydown, 0 if not pressed
let lastTapAt = 0      // timestamp of last tap-toggle release (for double-tap detection)
let locked = false     // true while a tap-toggle session is in progress (after a tap)
let active = false     // true while a recording session is live (start fired, stop not yet)
let pendingPasteLast = false  // double-tap detected on this DOWN; fire onPasteLast on the matching UP
let startDelayTimer: ReturnType<typeof setTimeout> | null = null  // pending fireStart, cancellable by a second DOWN

// Map the user-facing key name to the set of node-global-key-listener key names
// that should match. "CTRL" matches either LEFT or RIGHT control.
function keyMatches(saved: string, eventName: string): boolean {
  if (!saved) return false
  const norm = saved.trim().toUpperCase()
  if (norm === 'CTRL') return eventName === 'LEFT CTRL' || eventName === 'RIGHT CTRL'
  if (norm === 'ALT' || norm === 'OPTION') return eventName === 'LEFT ALT' || eventName === 'RIGHT ALT'
  if (norm === 'SHIFT') return eventName === 'LEFT SHIFT' || eventName === 'RIGHT SHIFT'
  if (norm === 'META' || norm === 'COMMAND' || norm === 'CMD') return eventName === 'LEFT META' || eventName === 'RIGHT META'
  return eventName === norm
}

function fireStart(): void {
  if (active) return
  active = true
  callbacks?.onStart()
}

function fireStop(): void {
  if (!active) return
  active = false
  callbacks?.onStop()
}

function fireAbort(): void {
  if (!active) return
  active = false
  callbacks?.onAbort()
}

function cancelStartDelay(): void {
  if (startDelayTimer) {
    clearTimeout(startDelayTimer)
    startDelayTimer = null
  }
}

// Force-fire the deferred fireStart immediately. Used when we
// disambiguate the user's intent BEFORE the delay expires (e.g. UP
// arrives within the delay window → it was a tap, start now).
function flushStartDelay(): void {
  if (startDelayTimer) {
    clearTimeout(startDelayTimer)
    startDelayTimer = null
    fireStart()
  }
}

// Resolver for an in-flight captureNextKey(), or null when not recording.
let capturePending: ((name: string) => void) | null = null

/** Abandoned if the user walks away mid-recording. */
const CAPTURE_TIMEOUT_MS = 15000

/**
 * Wait for the next key the user presses, as the LISTENER names it.
 *
 * The recorder used to read a browser KeyboardEvent, which could not see
 * two whole families of key. macOS eats F1-F12 as media keys before any
 * window receives them, so function keys produced no event to record.
 * And punctuation arrives under different names on the two sides — the
 * browser says "'", the listener says QUOTE — so an apostrophe recorded
 * in Settings never matched an apostrophe pressed for real.
 *
 * Reading the key from the listener fixes both at once and, more
 * usefully, means the recorder and the matcher share one vocabulary.
 * There is no translation table to keep in sync with the library.
 *
 * Returns null on timeout, or when no listener is running — the caller
 * shows the current binding unchanged rather than storing an empty key.
 */
export function captureNextKey(): Promise<string | null> {
  if (!listener) return Promise.resolve(null)
  // A second call supersedes the first; the earlier one resolves null so
  // its await does not hang forever.
  if (capturePending) {
    const stale = capturePending
    capturePending = null
    stale('')
  }
  return new Promise<string | null>(resolve => {
    const settle = (name: string) => resolve(name || null)
    capturePending = settle
    setTimeout(() => {
      if (capturePending === settle) {
        capturePending = null
        resolve(null)
      }
    }, CAPTURE_TIMEOUT_MS)
  })
}

/** Stop waiting for a key — the user closed the recorder. */
export function cancelKeyCapture(): void {
  if (capturePending) {
    const pending = capturePending
    capturePending = null
    pending('')
  }
}

export function registerHotkey(key: string, cbs: Callbacks): void {
  if (listener) {
    listener.kill()
    listener = null
  }
  cancelStartDelay()
  currentKey = key
  callbacks = cbs
  pressedAt = 0
  lastTapAt = 0
  locked = false
  active = false
  pendingPasteLast = false

  listener = new GlobalKeyboardListener()

  listener.addListener((e) => {
    // Recording a new hotkey. Handled here rather than in a second
    // listener because node-global-key-listener spawns a helper process
    // per instance, and two of them race for the same event tap.
    //
    // This also has to come BEFORE the keyMatches guard: the whole point
    // is to capture keys that are not the current hotkey.
    if (capturePending && e.state === 'DOWN') {
      const resolve = capturePending
      capturePending = null
      resolve(e.name ?? '')
      return
    }

    if (!currentKey || !callbacks) return
    if (!keyMatches(currentKey, e.name ?? '')) return

    const now = Date.now()

    if (e.state === 'DOWN') {
      // Ignore OS auto-repeat while held.
      if (pressedAt !== 0) return
      pressedAt = now

      // ── Case 1: Double tap. Second DOWN within dblTapWindowMs of the
      // prior tap-release. Cancel the deferred start (pill never lit),
      // abort any tap-toggle session in progress, fire onPasteLast on
      // the matching UP (modifier physically released by then so ⌘V
      // doesn't compound to ⌃⌘V).
      if (lastTapAt !== 0 && now - lastTapAt <= HOTKEY_TIMING.dblTapWindowMs) {
        lastTapAt = 0
        cancelStartDelay()
        const wasLocked = locked
        locked = false
        if (wasLocked) {
          // The earlier tap entered tap-toggle mode and recording is
          // still live — abort it. User wants paste, not a transcript.
          fireAbort()
        }
        pendingPasteLast = true
        return
      }

      // ── Case 2: User is in a locked tap-toggle session and just
      // pressed again to end it. Stop recording cleanly. No defer.
      if (locked) {
        locked = false
        fireStop()
        return
      }

      // ── Case 3: Fresh press. Could be the first of a double-tap, a
      // single tap (→ toggle), or a hold. We don't know yet, so we
      // DEFER fireStart by startDelayMs. When the timer expires:
      //   - If key is still pressed → it's a hold, fireStart only.
      //   - If key was released → it was a single tap, fireStart +
      //     enter tap-toggle mode.
      // If a second DOWN arrives before the timer expires (case 1
      // above), we cancel the timer entirely — the pill never lit
      // and paste-last fires on the second UP.
      cancelStartDelay()
      startDelayTimer = setTimeout(() => {
        startDelayTimer = null
        fireStart()
        if (pressedAt === 0) {
          // Key was released during the deferred window → single tap.
          // Enter tap-toggle mode. lastTapAt was set on the UP so a
          // follow-up DOWN within dblTapWindowMs still counts as
          // double-tap (but the dbl-tap window starts from the UP
          // moment, which is well before this timer fires — by the
          // time the timer fires, double-tap detection has already
          // played out via case 1 if it was going to happen).
          locked = true
        }
        // else: still held → hold-to-talk; release will stop.
      }, HOTKEY_TIMING.startDelayMs)
    } else if (e.state === 'UP') {
      if (pressedAt === 0) return
      const held = now - pressedAt
      pressedAt = 0

      if (pendingPasteLast) {
        // Hotkey now released — safe to inject ⌘V.
        pendingPasteLast = false
        callbacks.onPasteLast()
        return
      }

      if (locked) {
        // UP during an already-locked tap-toggle session is irrelevant
        // (the lock was set on the previous tap; this UP belongs to
        // the press that ended the lock — already handled in DOWN).
        return
      }

      // Released within the deferred-start window → it was a quick
      // tap. Mark lastTapAt so a follow-up DOWN within dblTapWindowMs
      // is caught as double-tap (case 1, which cancels the deferred
      // timer cleanly). The timer itself keeps running; when it
      // expires it sees pressedAt === 0 and enters tap-toggle mode.
      if (startDelayTimer) {
        lastTapAt = now
        return
      }

      // No pending timer means fireStart already ran (user held past
      // startDelayMs). Hold-release: stop recording.
      lastTapAt = 0
      fireStop()
      // unused but keeps TS happy if you ever read `held` for debug
      void held
    }
  })
}

export function unregisterHotkey(): void {
  if (listener) {
    listener.kill()
    listener = null
  }
  cancelStartDelay()
  currentKey = null
  callbacks = null
  pressedAt = 0
  lastTapAt = 0
  locked = false
  active = false
  pendingPasteLast = false
}

export function unregisterAll(): void {
  unregisterHotkey()
}
