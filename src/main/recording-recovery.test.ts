import { describe, it, expect } from 'vitest'
import {
  retryDelayMs,
  shouldAutoPaste,
  RETRY_BACKOFF_MS,
  AUTO_PASTE_WINDOW_MS,
} from './recording-recovery'

describe('retryDelayMs', () => {
  it('retries the first failure almost immediately', () => {
    expect(retryDelayMs(1)).toBe(RETRY_BACKOFF_MS[0])
  })

  it('backs off across the schedule', () => {
    expect(retryDelayMs(2)).toBe(RETRY_BACKOFF_MS[1])
    expect(retryDelayMs(3)).toBe(RETRY_BACKOFF_MS[2])
  })

  it('gives up once the schedule is exhausted', () => {
    expect(retryDelayMs(RETRY_BACKOFF_MS.length + 1)).toBeNull()
    expect(retryDelayMs(99)).toBeNull()
  })

  it('treats a zero/negative attempt count as the first retry', () => {
    expect(retryDelayMs(0)).toBe(RETRY_BACKOFF_MS[0])
    expect(retryDelayMs(-1)).toBe(RETRY_BACKOFF_MS[0])
  })
})

describe('shouldAutoPaste', () => {
  it('pastes when the user never left the app and barely any time passed', () => {
    expect(shouldAutoPaste('com.microsoft.VSCode', 'com.microsoft.VSCode', 1_500)).toBe(true)
  })

  it('refuses when the user has switched apps', () => {
    expect(shouldAutoPaste('com.microsoft.VSCode', 'com.tinyspeck.slackmacgap', 1_500)).toBe(false)
  })

  it('refuses once too much time has passed, even in the same app', () => {
    expect(shouldAutoPaste('com.microsoft.VSCode', 'com.microsoft.VSCode', AUTO_PASTE_WINDOW_MS + 1)).toBe(false)
  })

  it('allows the exact boundary', () => {
    expect(shouldAutoPaste('a', 'a', AUTO_PASTE_WINDOW_MS)).toBe(true)
  })

  it('refuses a launch-time recovery, where elapsed is large by definition', () => {
    expect(shouldAutoPaste('com.microsoft.VSCode', 'com.microsoft.VSCode', 6 * 60 * 60 * 1000)).toBe(false)
  })
})
