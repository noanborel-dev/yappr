// Head-to-head: distil-large-v3 vs current Accurate (large-v3-turbo-q5_0).
//
// Tests warm latency + transcription accuracy on a known phrase.
// Multiple clip lengths because encoder cost is constant per 30s
// window but decoder cost scales with tokens.

import { initWhisper, toggleNativeLog } from '@fugood/whisper.node'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

function runProc(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = '', stderr = ''
    child.stdout.on('data', d => stdout += d.toString())
    child.stderr.on('data', d => stderr += d.toString())
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

async function audioToPcm16(input) {
  const tmp = path.join(os.tmpdir(), `bench-${crypto.randomUUID()}.raw`)
  const ffmpegStatic = (await import('ffmpeg-static')).default
  const { code, stderr } = await runProc(ffmpegStatic, [
    '-y', '-i', input,
    '-ar', '16000', '-ac', '1',
    '-f', 's16le', '-acodec', 'pcm_s16le', tmp,
  ])
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-200)}`)
  const buf = fs.readFileSync(tmp)
  fs.unlinkSync(tmp)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

await toggleNativeLog(false)

const HOME = os.homedir()
const models = [
  { name: 'CURRENT large-v3-turbo-q5_0 (547MB)', path: path.join(HOME, 'Library/Application Support/yappr/models/ggml-large-v3-turbo-q5_0.bin') },
  { name: 'distil-large-v3 fp16 (1449MB)',       path: '/tmp/whisper-models/ggml-distil-large-v3.bin' },
]

// Reuse existing test clips. Add the long-paragraph clip if available.
const clips = [
  '/tmp/yappr-smoke.webm',
  '/tmp/test-brand2.webm',
  '/tmp/test-multi.webm',
  '/tmp/long.webm',
].filter(p => fs.existsSync(p))

for (const m of models) {
  if (!fs.existsSync(m.path)) {
    console.log(`SKIP ${m.name} — file missing at ${m.path}`)
    continue
  }
  console.log(`\n=== ${m.name} ===`)
  const loadStart = Date.now()
  const ctx = await initWhisper({ filePath: m.path, useGpu: true, useFlashAttn: true })
  console.log(`  load: ${Date.now() - loadStart}ms`)

  for (const clipPath of clips) {
    const pcm = await audioToPcm16(clipPath)
    const seconds = pcm.byteLength / 2 / 16000
    // Warm
    await ctx.transcribeData(pcm, { language: 'en', beamSize: 1, bestOf: 1, temperature: 0, maxThreads: 4 }).promise

    const times = []
    let text = ''
    for (let i = 0; i < 3; i++) {
      const t = Date.now()
      const r = await ctx.transcribeData(pcm, { language: 'en', beamSize: 1, bestOf: 1, temperature: 0, maxThreads: 4 }).promise
      times.push(Date.now() - t)
      text = r.result.trim()
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    console.log(`\n  [${path.basename(clipPath)}] ${seconds.toFixed(1)}s audio — avg ${avg}ms (${times.join(',')}ms)`)
    console.log(`  "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`)
  }

  await ctx.release()
}
