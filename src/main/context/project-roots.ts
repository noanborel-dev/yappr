// The impure half of project profiling: find where projects live, and
// read the one file we are allowed to read.
//
// Pure logic lives next door — parsing in proc-tree.ts (findShellPids,
// parseLsofCwds) and the manifest → facts table in project-profile.ts.
// This module is only the exec plumbing, which is why it has no tests.
//
// Runs from the compactor, on its idle gate, never from the pipeline.
// One `ps` is ~70ms and one batched `lsof` is ~86ms on a machine with 958
// processes — nothing that size belongs on the path between hotkey
// release and paste.

import { execFile } from 'child_process'
import { readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { logError } from '../log'
import { parsePsArgs, findShellPids, parseLsofCwds } from '../proc-tree'
import { normalizeProjectKey } from './project-key'
import { factsFromManifest, READABLE_MANIFEST } from './project-profile'

const PROBE_TIMEOUT_MS = 1500

// A package.json larger than this is not a manifest we understand; it is
// a generated file or something pathological. Cheaper to skip than to
// parse megabytes on a background thread.
const MAX_MANIFEST_BYTES = 512 * 1024

function exec(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/**
 * Directories currently open in a shell.
 *
 * These are project roots because a shell in an editor's integrated
 * terminal sits in the repo the user is working on. Returns [] rather
 * than throwing: a missing profile is a missing nicety, never an error
 * the user should see.
 */
async function activeRoots(): Promise<string[]> {
  try {
    const rows = parsePsArgs(await exec('/bin/ps', ['-axo', 'pid=,ppid=,args=']))
    const pids = findShellPids(rows)
    if (pids.length === 0) return []
    // One lsof for every shell at once — per-pid calls would multiply the
    // 86ms by however many terminals are open.
    const out = await exec('/usr/sbin/lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'])
    return parseLsofCwds(out)
  } catch (err) {
    logError('[project-profile] root probe failed', err)
    return []
  }
}

/**
 * Read the manifest at `root` and turn it into facts.
 *
 * ONLY package.json is opened, and only dependency NAMES are taken from
 * it — see the privacy boundary in project-profile.ts. Facts are injected
 * into cleanup prompts, which route through Yappr's proxy, so everything
 * this returns leaves the machine.
 */
function profileAt(root: string): string[] {
  const manifestPath = join(root, READABLE_MANIFEST)
  try {
    if (statSync(manifestPath).size > MAX_MANIFEST_BYTES) return []
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    return factsFromManifest({ dependencies, rootFiles: [] })
  } catch {
    // No package.json, unreadable, or not JSON. A Rust or Go repo lands
    // here and correctly gets no profile rather than an invented one.
    return []
  }
}

/**
 * Profiles for the projects currently open in a shell, keyed the same way
 * facts are.
 *
 * The caller decides what to do with keys it does not recognise — see the
 * note in the compactor on why an unknown key is skipped rather than
 * creating a bucket.
 */
export async function readProjectProfiles(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const root of await activeRoots()) {
    const key = normalizeProjectKey(basename(root))
    if (!key) continue
    const facts = profileAt(root)
    if (facts.length > 0) out.set(key, facts)
  }
  return out
}
