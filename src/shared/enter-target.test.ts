import { describe, it, expect } from 'vitest'
import { swallowsEnter } from './enter-target'

// Reported: "for the slider in the notch adjust in the onboarding, when
// you adjust it and click enter it enters on the slider and not goes
// next." NotchStep's control is <input type="range">, and the shell's
// guard skipped every <input>, so Enter was treated as typing.

describe('controls that do NOT take Enter — the flow should advance', () => {
  it('the notch-width slider', () => {
    expect(swallowsEnter({ tagName: 'INPUT', type: 'range' })).toBe(false)
  })

  it.each(['checkbox', 'radio', 'color', 'file'])('an <input type=%s>', (type) => {
    expect(swallowsEnter({ tagName: 'INPUT', type })).toBe(false)
  })

  it('a plain button or div', () => {
    expect(swallowsEnter({ tagName: 'BUTTON' })).toBe(false)
    expect(swallowsEnter({ tagName: 'DIV' })).toBe(false)
  })

  it('nothing focused at all', () => {
    expect(swallowsEnter(null)).toBe(false)
    expect(swallowsEnter(undefined)).toBe(false)
  })
})

describe('controls that DO take Enter — the flow must not steal it', () => {
  it('a text field', () => {
    // The reason the guard exists. ContextStep pastes into a textarea and
    // KeyStep has real inputs; Enter there is the user typing.
    expect(swallowsEnter({ tagName: 'INPUT', type: 'text' })).toBe(true)
  })

  it('an <input> with no type, which is a text field', () => {
    expect(swallowsEnter({ tagName: 'INPUT' })).toBe(true)
  })

  it('a textarea', () => {
    expect(swallowsEnter({ tagName: 'TEXTAREA' })).toBe(true)
  })

  it('a contenteditable', () => {
    expect(swallowsEnter({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it.each(['search', 'email', 'password', 'number', 'submit'])('<input type=%s>', (type) => {
    expect(swallowsEnter({ tagName: 'INPUT', type })).toBe(true)
  })

  it('is case-insensitive about both tag and type', () => {
    expect(swallowsEnter({ tagName: 'input', type: 'TEXT' })).toBe(true)
    expect(swallowsEnter({ tagName: 'input', type: 'RANGE' })).toBe(false)
  })
})
