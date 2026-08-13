import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import type { NotchState } from '../../indicator/notch-states'
import { SectionHead } from '../../shared/ui/SectionHead'
import { MenuBar, NotchMark } from '../../shared/ui/NotchMark'

// Map a browser KeyboardEvent to a single canonical key name.
function eventToSingleKey(e: KeyboardEvent): string | null {
  const code = e.code
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL'
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT'
  if (code === 'MetaLeft' || code === 'MetaRight') return 'META'
  if (e.key.length === 1) return e.key.toUpperCase()
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toUpperCase()
  return null
}

// Render a key as the glyph(s) shown inside the keycap.
function keyDisplay(name: string): string {
  if (name === 'CTRL') return '⌃'
  if (name === 'ALT') return '⌥'
  if (name === 'SHIFT') return '⇧'
  if (name === 'META') return '⌘'
  if (name === 'SPACE' || name === ' ') return 'space'
  return name.toLowerCase()
}

const KEY_NAME: Record<string, string> = {
  '⌃': 'Control',
  '⌥': 'Option',
  '⇧': 'Shift',
  '⌘': 'Command',
}

export default function HotkeysTab() {
  const [hotkeys, setHotkeys] = useState<Settings['hotkeys'] | null>(null)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    window.yappr.getSettings().then(s => setHotkeys(s.hotkeys))
  }, [])

  useEffect(() => {
    if (!listening) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      const next = eventToSingleKey(e)
      if (!next) return
      setHotkeys(prev => {
        if (!prev) return prev
        const updated = { ...prev, pushToTalk: next }
        window.yappr.setSettings({ hotkeys: updated }).then(() => {
          window.yappr.reloadHotkeys()
        })
        return updated
      })
      setListening(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening])

  if (!hotkeys) return <div className="text-ink-45 text-sm">Loading…</div>

  const glyph = keyDisplay(hotkeys.pushToTalk)

  return (
    <div className="max-w-[720px]">
      <SectionHead
        ord="02"
        label="Hotkey"
        headline={<>Hold <em className="italic">{KEY_NAME[glyph] ?? glyph}</em>. Say anything.</>}
        body="One key does three things. Click the keycap to bind a different one."
      />

      <div className="flex items-center gap-5 mb-6">
        <Keycap
          glyph={glyph}
          listening={listening}
          onClick={() => setListening(l => !l)}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">
            {listening ? 'Press any key…' : 'Push to talk'}
          </div>
          <p className="text-[11.5px] text-ink-60 mt-1 leading-relaxed max-w-[38ch]">
            {listening
              ? 'The next key you press becomes your dictation key. Modifiers work on their own.'
              : 'Release and the polished text lands in whatever app you were in.'}
          </p>
          <button
            onClick={() => setListening(l => !l)}
            className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-45 hover:text-ink mt-2.5 transition-colors"
          >
            {listening ? 'cancel' : '↺ rebind'}
          </button>
        </div>
      </div>

      <Gestures glyph={glyph} />
    </div>
  )
}

// ─── The three behaviors ────────────────────────────────────────────
//
// Ported down from the landing page's section, at a fraction of the size.
// The page version is a 360px full-bleed billboard with 44px serif titles
// — right for a marketing page, wrong for a settings pane, where the same
// three facts have to sit next to the control that changes them.
//
// The indicator shown is the real notch, hanging from a menu-bar strip.
// It used to be a floating lozenge with a running timer, i.e. a picture of
// an indicator this app no longer has.

type Mode = 'tap' | 'hold' | 'double'

const PANELS: Array<{ mode: Mode; ord: string; name: string; line: string }> = [
  { mode: 'tap', ord: '01', name: 'Tap', line: 'Toggle recording on. Tap again to stop.' },
  { mode: 'hold', ord: '02', name: 'Hold', line: 'Record while held. Release to finish.' },
  { mode: 'double', ord: '03', name: 'Double-tap', line: 'Paste your last dictation again.' },
]

// Each frame is [notch state, is the key down]. Advanced on a fixed tick,
// so a sequence's length is its duration.
const FRAMES: Record<Mode, Array<[NotchState, boolean]>> = {
  tap: [
    ['idle', false],
    ['idle', true],
    ['recording', false],
    ['recording', false],
    ['recording', true],
    ['processing', false],
    ['done', false],
    ['done', false],
  ],
  hold: [
    ['idle', false],
    ['recording', true],
    ['recording', true],
    ['recording', true],
    ['recording', true],
    ['processing', false],
    ['done', false],
    ['done', false],
  ],
  double: [
    ['idle', false],
    ['idle', true],
    ['idle', false],
    ['idle', true],
    ['pasting', false],
    ['pasting', false],
    ['done', false],
    ['done', false],
  ],
}

const TICK_MS = 620

// Names what the shape is doing, so the loop teaches rather than just
// moving. Keyed off the notch state so it can never describe a frame the
// indicator isn't actually showing.
const CAPTION: Partial<Record<NotchState, string>> = {
  idle: 'nothing running',
  recording: 'listening — say it however it comes out',
  processing: 'polishing for wherever you were typing',
  done: 'pasted, in place',
  pasting: 'your last dictation, again',
}

function Gestures({ glyph }: { glyph: string }) {
  const [frame, setFrame] = useState(0)
  const [active, setActive] = useState<Mode>('tap')

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => {
        const next = f + 1
        if (next >= FRAMES[active].length) {
          setActive((m) => (m === 'tap' ? 'hold' : m === 'hold' ? 'double' : 'tap'))
          return 0
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [active])

  const [state, keyDown] = FRAMES[active][Math.min(frame, FRAMES[active].length - 1)]

  return (
    <div className="stage-bleed border-y border-line overflow-hidden">
      {/* One shared stage. Three separate looping mocks side by side would
          be three animations in one viewport — the page rules cap that at
          one, and they were right: it read as noise. */}
      <div className="bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)] relative">
        <MenuBar>
          <NotchMark state={state} notchWidth={92} />
        </MenuBar>
        <div className="flex flex-col items-center justify-center gap-5 py-12">
          <MiniKeycap glyph={glyph} pressed={keyDown} />
          {/* Caption track, as under the site's live demo — it names what
              you're watching, so the loop teaches instead of just moving. */}
          <div className="h-5 text-[11.5px] font-mono text-white/70 tracking-wide">
            {CAPTION[state] ?? ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3">
        {PANELS.map((p, i) => {
          const on = active === p.mode
          return (
            <button
              key={p.mode}
              onClick={() => { setActive(p.mode); setFrame(0) }}
              className={[
                'relative text-left px-5 py-4 transition-colors duration-300',
                i < 2 ? 'border-r border-line-soft' : '',
                on ? 'bg-accent-soft' : 'bg-card hover:bg-paper/60',
              ].join(' ')}
            >
              <div
                className={[
                  'text-[10px] font-mono uppercase tracking-[0.16em] mb-1.5',
                  on ? 'text-accent' : 'text-ink-45',
                ].join(' ')}
              >
                {p.ord}
              </div>
              <div className="font-display italic text-[24px] leading-none tracking-tight text-ink">
                {p.name}
              </div>
              <div className="text-[11px] text-ink-60 leading-snug mt-2">{p.line}</div>
              {on && <span className="absolute left-0 bottom-0 h-[2px] w-full bg-accent" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A physical keycap — cream plastic, a real travel distance when pressed.
function MiniKeycap({ glyph, pressed }: { glyph: string; pressed: boolean }) {
  return (
    <div
      style={{
        width: 62,
        height: 62,
        borderRadius: 13,
        background: 'linear-gradient(180deg, #fdfbf3 0%, #e9e1c8 100%)',
        border: '1px solid #c5bda0',
        boxShadow: pressed
          ? '0 1px 0 #b8af90, 0 2px 5px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.7)'
          : '0 5px 0 #b8af90, 0 9px 18px rgba(0,0,0,0.22), inset 0 2px 0 rgba(255,255,255,0.7)',
        transform: pressed ? 'translateY(4px)' : 'translateY(0)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span
        className="font-mono text-ink leading-none"
        style={{ fontSize: glyph.length > 2 ? 13 : 22, fontWeight: 500 }}
      >
        {glyph}
      </span>
      {KEY_NAME[glyph] && (
        <span className="font-mono text-ink-45 uppercase" style={{ fontSize: 7, letterSpacing: '0.1em' }}>
          {KEY_NAME[glyph]}
        </span>
      )}
    </div>
  )
}

// The bindable keycap at the top of the tab. Same physical language as the
// one on the stage, scaled up, with the rebind affordance on it.
function Keycap({
  glyph,
  listening,
  onClick,
}: {
  glyph: string
  listening: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Rebind dictation key"
      className="shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5"
      style={{
        width: 86,
        height: 86,
        borderRadius: 16,
        background: 'linear-gradient(180deg, #fdfbf3 0%, #e9e1c8 100%)',
        border: listening ? '1.5px solid #C8553D' : '1px solid #c5bda0',
        boxShadow: listening
          ? '0 0 0 4px rgba(200,85,61,0.14), 0 6px 0 #b8af90, 0 12px 22px rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.7)'
          : '0 6px 0 #b8af90, 0 12px 22px rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      <span
        className="font-mono text-ink leading-none"
        style={{ fontSize: glyph.length > 2 ? 17 : 30, fontWeight: 500 }}
      >
        {glyph}
      </span>
      {KEY_NAME[glyph] && (
        <span className="font-mono text-ink-45 uppercase" style={{ fontSize: 8, letterSpacing: '0.1em' }}>
          {KEY_NAME[glyph]}
        </span>
      )}
    </button>
  )
}
