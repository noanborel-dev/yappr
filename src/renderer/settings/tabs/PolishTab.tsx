import { useEffect, useState } from 'react'
import type { CategoryStrictness, Settings, Strictness } from '../../../shared/types'
import { SectionHead } from '../../shared/ui/SectionHead'
import { PolishFanout } from '../../shared/ui/PolishFanout'

type Bucket = keyof CategoryStrictness

// META, ORDER, CODE_EXAMPLE, Segmented and Preview all went with the row
// panel below the fan-out. Every one of them existed to render a second
// copy of what the cards already show, and the lane definitions in
// PolishFanout now carry the titles and app lists directly.

export default function PolishTab() {
  const [strictness, setStrictness] = useState<CategoryStrictness | null>(null)
  // The row whose preview is open. Previews used to live in a hero above
  // the table and appear on hover, which meant the example you were
  // reading vanished the moment you moved the pointer toward the control
  // that changes it. Now the preview is inside the row.
  const [open, setOpen] = useState<Bucket | 'code'>('personal')

  useEffect(() => {
    window.yappr.getSettings().then((s: Settings) => setStrictness(s.strictness))
  }, [])

  if (!strictness) return <div className="text-ink-45 text-sm">Loading…</div>

  function setLevel(bucket: Bucket, lvl: Strictness) {
    if (!strictness) return
    const next = { ...strictness, [bucket]: lvl }
    setStrictness(next)
    setOpen(bucket)
    window.yappr.setSettings({ strictness: next })
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        headline={<>One voice, three <em className="italic">registers</em>.</>}
        body="One dictation, three destinations. Code and terminal stay faithful — words are never dropped there."
      />

      {/* The cards ARE the controls now. There used to be a panel of
          three rows below this repeating the same three registers with
          the same three-way switch, plus a locked "Code & Terminal" row
          explaining a setting nobody can change — four explanations of
          one idea stacked down the page. */}
      <PolishFanout
        strictness={strictness}
        active={open}
        onPick={(id) => setOpen(id)}
        onLevel={setLevel}
      />

    </div>
  )
}


// Sprinkles one relevant emoji when there's a concrete moment to hang it
// on. Casual chats only — never Slack, email, docs or code.

// Skips the LLM pass entirely. The deterministic passes still run, so this
// is "no restyling", not "no cleanup".
