import { describe, it, expect } from 'vitest'
import {
  engineForModel,
  buildParakeetOptions,
  buildDecodeOptions,
} from './transcribe-core'

describe('engineForModel', () => {
  it('routes parakeet model ids to the parakeet engine', () => {
    expect(engineForModel('parakeet-tdt-0.6b-v3')).toBe('parakeet')
  })

  it('routes a parakeet FILE PATH to the parakeet engine', () => {
    // The worker only ever sees a path, never the tier id.
    expect(engineForModel('/models/ggml-parakeet-tdt-0.6b-v3-q4_0.bin')).toBe('parakeet')
  })

  it('routes every whisper tier to the whisper engine', () => {
    expect(engineForModel('base')).toBe('whisper')
    expect(engineForModel('small')).toBe('whisper')
    expect(engineForModel('large-v3-turbo')).toBe('whisper')
    expect(engineForModel('/models/ggml-large-v3-turbo-q5_0.bin')).toBe('whisper')
  })
})

describe('buildParakeetOptions', () => {
  it('emits only options the parakeet binding accepts', () => {
    // Passing whisper's options to parakeet is a type error at the call
    // site; this keeps the shape honest if the option set ever grows.
    expect(Object.keys(buildParakeetOptions()).sort()).toEqual(['maxThreads'])
  })

  it('uses the same 4-thread cap as whisper (E-core spill)', () => {
    expect(buildParakeetOptions().maxThreads).toBe(4)
  })
})

describe('buildDecodeOptions still targets whisper', () => {
  it('carries the dictionary as an initial prompt', () => {
    expect(buildDecodeOptions({ dictionary: ['Yappr'] }).prompt).toBe('Yappr')
  })

  it('defaults to auto language so code-switching keeps working', () => {
    expect(buildDecodeOptions().language).toBe('auto')
  })
})
