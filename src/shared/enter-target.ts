// Does the focused element consume Enter itself?
//
// The onboarding shell listens for Enter globally and advances the flow.
// It must not do that while the user is typing — Enter in a text box is a
// newline, or a submit, and stealing it is worse than having no keyboard
// route at all.
//
// The original guard skipped every <input>, which is where this went
// wrong: the notch-width control in NotchStep is `<input type="range">`.
// A slider is an input by tag and nothing like one by behaviour — Enter
// means nothing to it, and there is no text to interrupt. So adjusting
// the slider and pressing Enter did nothing at all, because focus was
// still on the slider and the shell had decided the user was typing.
//
// Pure, and takes the three fields it needs rather than an Element, so it
// can be tested without a DOM.

/** Input types that DO take Enter — text entry, or a form submit. */
const ENTER_CONSUMING_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
  'submit', 'button', 'reset', 'image',
])

export function swallowsEnter(el: {
  tagName?: string | null
  type?: string | null
  isContentEditable?: boolean
} | null | undefined): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  // An <input> with no type attribute is a text field.
  const type = (el.type ?? 'text').toLowerCase()
  return ENTER_CONSUMING_INPUT_TYPES.has(type)
}
