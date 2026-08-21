// Sweep maxThreads to find the sweet spot on M5 Pro (6 P + 12 E cores).
// More threads != faster when E-cores are slower than P-cores.

import { initWhisper, toggleNativeLog } from '@fugood/whisper.node'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const INPUT = process.argv[2] ?? '/tmp/test-tech.webm'
const HOME = os.homedir()

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
const pcm = await audioToPcm16(INPUT)
console.log(`audio: ${(pcm.byteLength / 2 / 16000).toFixed(2)}s`)
console.log()

const model = path.join(HOME, 'Library/Application Support/yappr/models/ggml-large-v3-turbo-q5_0.bin')
const ctx = await initWhisper({ filePath: model, useGpu: true, useFlashAttn: true })

// Warm up
await ctx.transcribeData(pcm, { language: 'en', beamSize: 1, bestOf: 1, temperature: 0, maxThreads: 4 }).promise

for (const threads of [1, 2, 4, 6, 8, 12]) {
  const times = []
  for (let i = 0; i < 4; i++) {
    const t = Date.now()
    await ctx.transcribeData(pcm, { language: 'en', beamSize: 1, bestOf: 1, temperature: 0, maxThreads: threads }).promise
    times.push(Date.now() - t)
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  console.log(`maxThreads=${threads}:  ${times.join('ms, ')}ms  avg ${avg}ms`)
}

await ctx.release()
