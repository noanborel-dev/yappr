// The Enter key, drawn large and tapping itself.
//
// Every screen in this flow ends the same way, so the cue is drawn once,
// by the shell, in one place. A per-step affordance would drift in
// position between screens and the eye would have to re-find it each time;
// pinned to the same spot it becomes furniture you stop reading and start
// using.
//
// It is a KEYCAP, not a button, and deliberately not clickable. The thing
// being taught is that the keyboard drives this, and a keycap you can
// click with the mouse teaches the opposite.
//
// The press is real depth — the cap moves down onto its own shadow rather
// than just dimming — because a flat blink reads as a notification badge.

export function EnterCue({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none fixed bottom-7 left-1/2 -translate-x-1/2 z-40',
        'flex items-center gap-3',
        'transition-[opacity,transform] duration-500 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      <span className="onb-keycap">
        {/* The return glyph the key itself carries, not the word. */}
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 6v5a3 3 0 0 1-3 3H6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 10.5 6 14l3.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {/* One word. The keycap says how, this says what — without it a
          bare key floating at the bottom of the screen is a puzzle. */}
      <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-45">
        next
      </span>
    </div>
  )
}
