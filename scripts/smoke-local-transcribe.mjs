// Bench @fugood/whisper.node — same scenario as the smart-whisper test
// but against the alternative binding that uses whisper_full() instead
// of whisper_full_with_state(), avoiding the per-call Metal init/free.
//
// Usage: node scripts/smoke-fugood.mjs /tmp/yappr-smoke.webm

import { initWhisper, toggleNativeLog } from '@fugood/whisper.node'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const INPUT = process.argv[2] ?? '/tmp/yappr-smoke.webm'
const MODEL = path.join(
  os.homedir(),
  'Library/Application Support/yappr/models/ggml-large-v3-turbo-q5_0.bin'
)

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
console.log(`audio: ${(pcm.byteLength / 2 / 16000).toFixed(2)}s (${pcm.byteLength} bytes PCM16)`)

const t0 = Date.now()
const ctx = await initWhisper({
  filePath: MODEL,
  useGpu: true,
})
console.log(`model load: ${Date.now() - t0}ms`)

console.log()
console.log('--- 5 warm transcribes ---')
for (let i = 0; i < 5; i++) {
  const t = Date.now()
  const { promise } = ctx.transcribeData(pcm, {
    language: 'en',
    maxThreads: 8,
    beamSize: 1,
    bestOf: 1,
    temperature: 0,
  })
  const result = await promise
  const ms = Date.now() - t
  console.log(`run ${i+1}:  ${ms}ms  →  "${result.result.trim()}"`)
}

console.log()
console.log('--- 5 transcribes with maxContext=64 (encoder shortcut) ---')
for (let i = 0; i < 5; i++) {
  const t = Date.now()
  const { promise } = ctx.transcribeData(pcm, {
    language: 'en',
    maxThreads: 8,
    beamSize: 1,
    bestOf: 1,
    temperature: 0,
    maxContext: 64,
  })
  const result = await promise
  const ms = Date.now() - t
  console.log(`run ${i+1}:  ${ms}ms  →  "${result.result.trim()}"`)
}

await ctx.release()
