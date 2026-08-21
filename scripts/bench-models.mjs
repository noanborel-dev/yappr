// Compare whisper.cpp+Metal warm-inference latency across models.
//
// Same pipeline our provider uses (ffmpeg → PCM16 → fugood transcribeData)
// so the numbers reflect actual user-facing latency, not pure ggml bench.

import { initWhisper, toggleNativeLog } from '@fugood/whisper.node'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const INPUT = process.argv[2] ?? '/tmp/yappr-smoke.webm'

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
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    tmp,
  ])
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-200)}`)
  const buf = fs.readFileSync(tmp)
  fs.unlinkSync(tmp)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

await toggleNativeLog(false)

const pcm = await audioToPcm16(INPUT)
console.log(`audio: ${(pcm.byteLength / 2 / 16000).toFixed(2)}s`)
console.log()

const HOME = os.homedir()
const models = [
  { name: 'large-v3-turbo-q5_0 (current)', path: path.join(HOME, 'Library/Application Support/yappr/models/ggml-large-v3-turbo-q5_0.bin') },
  { name: 'small.en-q5_1 (181MB)',          path: '/tmp/whisper-models/small.en-q5_1.bin' },
  { name: 'base.en-q5_1 (57MB)',            path: '/tmp/whisper-models/base.en-q5_1.bin' },
]

for (const m of models) {
  if (!fs.existsSync(m.path)) {
    console.log(`SKIP ${m.name} — file missing at ${m.path}`)
    continue
  }
  console.log(`=== ${m.name} ===`)
  const loadStart = Date.now()
  const ctx = await initWhisper({ filePath: m.path, useGpu: true })
  console.log(`  load: ${Date.now() - loadStart}ms`)

  // Warm
  await (ctx.transcribeData(pcm, { language: 'en', beamSize: 1, bestOf: 1, temperature: 0, maxThreads: 8 })).promise

  const times = []
  for (let i = 0; i < 5; i++) {
    const t = Date.now()
    const { promise } = ctx.transcribeData(pcm, {
      language: 'en',
      beamSize: 1,
      bestOf: 1,
      temperature: 0,
      maxThreads: 8,
    })
    const r = await promise
    times.push(Date.now() - t)
    if (i === 0) console.log(`  text: "${r.result.trim()}"`)
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  console.log(`  warm runs: ${times.join('ms, ')}ms (avg ${avg}ms)`)
  await ctx.release()
  console.log()
}
