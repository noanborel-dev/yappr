import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import { Pill } from '../../shared/ui/Pill'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { MenuBar, NotchMark } from '../../shared/ui/NotchMark'

export default function DictionaryTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    window.yappr.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="text-ink-45 text-sm">Loading…</div>

  const terms = settings.userDictionary ?? []

  async function persist(next: string[]) {
    if (!settings) return
    await window.yappr.setSettings({ userDictionary: next })
    setSettings({ ...settings, userDictionary: next })
  }

  function add() {
    const t = draft.trim()
    if (!t) return
    if (terms.some(x => x.toLowerCase() === t.toLowerCase())) {
      setDraft('')
      return
    }
    persist([...terms, t])
    setDraft('')
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        headline={<>Names &amp; <em className="italic">jargon</em>, recognized.</>}
        body="Add what Whisper keeps mishearing. Common terms — Claude, GitHub, OAuth, kubectl — are already built in."
      />

      <MishearingStrip />

      <div className="flex items-stretch gap-2 mb-5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="A name, a product, a piece of jargon…"
          className="flex-1 bg-card border border-line rounded-input px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-45 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <Pill variant="primary" size="sm" onClick={add} disabled={!draft.trim()}>
          Add word
        </Pill>
      </div>

      <div className="flex items-baseline justify-between mb-2.5">
        <GroupLabel className="mb-0">Your terms</GroupLabel>
        <span className={`text-[10px] font-mono ${terms.length > 40 ? 'text-accent' : 'text-ink-45'}`}>
          {terms.length} / ~40
        </span>
      </div>

      {terms.length === 0 ? (
        <div className="bg-card border border-line rounded-card px-5 py-8 text-center text-[11.5px] text-ink-45">
          Nothing added yet. The built-in list still applies.
        </div>
      ) : (
        // Chips, not a two-column grid of cards. A dictionary entry is one
        // word — giving each its own bordered card made 12 terms look like
        // a settings screen of their own.
        <div className="flex flex-wrap gap-2">
          {terms.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="group inline-flex items-center gap-1.5 bg-card border border-line rounded-pill pl-3.5 pr-1.5 py-1.5 text-[12px]"
            >
              {t}
              <button
                onClick={() => persist(terms.filter((_, j) => j !== i))}
                aria-label={`Remove ${t}`}
                className="w-5 h-5 inline-flex items-center justify-center rounded-full text-ink-45 hover:text-ink hover:bg-ink/[0.07] transition-colors leading-none text-[13px]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-[10.5px] text-ink-45 mt-5 leading-relaxed">
        Whisper caps its prompt at 224 tokens, so past roughly 40 terms the oldest
        stop being biased. Keep the list to words it actually gets wrong.
      </p>
    </div>
  )
}

// ─── Proof strip ────────────────────────────────────────────────────
//
// Was a 300×200 fake macOS window — traffic lights, a floating pill in the
// title bar, a pagination rail. All of that framing to show one sentence
// changing. This is the sentence, changing.

interface Sample {
  wrong: Array<{ text: string; bad?: boolean }>
  right: Array<{ text: string; hit?: boolean }>
}

const SAMPLES: Sample[] = [
  {
    wrong: [{ text: 'push to ' }, { text: 'Get Hub', bad: true }, { text: ' and run ' }, { text: 'koob control', bad: true }],
    right: [{ text: 'Push to ' }, { text: 'GitHub', hit: true }, { text: ' and run ' }, { text: 'kubectl', hit: true }, { text: '.' }],
  },
  {
    wrong: [{ text: 'send to ' }, { text: 'Anthrope', bad: true }, { text: ' about ' }, { text: 'Cloud', bad: true }, { text: ' Sonnet' }],
    right: [{ text: 'Send to ' }, { text: 'Anthropic', hit: true }, { text: ' about ' }, { text: 'Claude', hit: true }, { text: ' Sonnet.' }],
  },
  {
    wrong: [{ text: 'update the ' }, { text: 'OH-auth', bad: true }, { text: ' flow in ' }, { text: 'next JS', bad: true }],
    right: [{ text: 'Update the ' }, { text: 'OAuth', hit: true }, { text: ' flow in ' }, { text: 'Next.js', hit: true }, { text: '.' }],
  },
]

const CYCLE_MS = 4800

function MishearingStrip() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % SAMPLES.length), CYCLE_MS)
    return () => window.clearInterval(id)
  }, [])
  const s = SAMPLES[idx]

  return (
    <div className="stage-bleed bg-cream2/60 border-y border-line mb-7 overflow-hidden">
      <style>{`
        @keyframes dict-out { 0%, 36% { opacity: 1; } 46%, 100% { opacity: 0; } }
        @keyframes dict-in  { 0%, 42% { opacity: 0; } 54%, 100% { opacity: 1; } }
        .dict-out { animation: dict-out ${CYCLE_MS}ms ease-in-out infinite; }
        .dict-in  { animation: dict-in  ${CYCLE_MS}ms ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dict-out { animation: none; opacity: 0; }
          .dict-in  { animation: none; opacity: 1; }
        }
      `}</style>

      {/* A desktop for the strip to be part of — over bare cream the
          translucent bar disappears and the shape reads as floating. */}
      <div className="bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)]">
        <MenuBar>
          <NotchMark state="recording" notchWidth={92} />
        </MenuBar>
      </div>

      <div className="px-9 pt-7 pb-8">
        <div className="text-[11px] text-accent mb-3">
          heard → written
        </div>
        {/* One big line of type, the way the site does it. Fixed height so
            the two layers can cross-fade without the band resizing.

            The segments stay INLINE inside one <p>: as flex children they
            were flex items, and flex layout drops each item's leading and
            trailing whitespace — it rendered "push toGet Huband run…". */}
        <div key={idx} className="relative h-[74px]">
          <p className="dict-out absolute inset-0 flex items-center font-display italic text-[26px] leading-[1.3] text-ink-60">
            <span>
              {s.wrong.map((seg, i) => (
                <span
                  key={i}
                  className={seg.bad ? 'line-through decoration-danger/60 text-danger/80' : ''}
                >
                  {seg.text}
                </span>
              ))}
            </span>
          </p>
          <p className="dict-in absolute inset-0 flex items-center font-display italic text-[26px] leading-[1.3] text-ink">
            <span>
              {s.right.map((seg, i) => (
                <span
                  key={i}
                  className={seg.hit ? 'underline decoration-accent decoration-[3px] underline-offset-[5px]' : ''}
                >
                  {seg.text}
                </span>
              ))}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          {SAMPLES.map((_, i) => (
            <span
              key={i}
              className={[
                'h-1 rounded-full transition-all duration-300',
                i === idx ? 'w-5 bg-ink' : 'w-1.5 bg-ink/15',
              ].join(' ')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
