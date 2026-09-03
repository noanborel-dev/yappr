import { describe, it, expect } from 'vitest'
import { findShellPids, parseLsofCwds, parsePsArgs } from './proc-tree'

describe('findShellPids', () => {
  it('finds the shell inside an editor terminal', () => {
    // The real shape, from `ps -axo pid=,ppid=,args=` on this machine:
    // a login shell under VS Code's Code Helper.
    const rows = parsePsArgs([
      '1256 1 /Applications/Visual Studio Code.app/Contents/MacOS/Code',
      '2121 1256 /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper',
      '2127 2121 /bin/zsh -il',
      '3692 2127 claude',
    ].join('\n'))
    expect(findShellPids(rows)).toEqual([2127])
  })

  it('recognises a login shell despite the leading dash', () => {
    // Login shells are argv[0]-mangled to "-zsh"; matching naively misses
    // every terminal opened the normal way.
    expect(findShellPids(parsePsArgs('42 1 -zsh'))).toEqual([42])
  })

  it('ignores things that merely mention a shell', () => {
    const rows = parsePsArgs('7 1 /usr/bin/vim ~/.zshrc\n8 1 /bin/zsh')
    expect(findShellPids(rows)).toEqual([8])
  })

  it('caps how many it returns', () => {
    const rows = parsePsArgs(
      Array.from({ length: 40 }, (_, i) => `${i + 1} 1 /bin/zsh`).join('\n'),
    )
    expect(findShellPids(rows, 5)).toHaveLength(5)
  })
})

describe('parseLsofCwds', () => {
  it('reads the -F machine format', () => {
    expect(parseLsofCwds('p2127\nn/Users/noanborel/Yappr\np3692\nn/Users/noanborel/Yappr/YapprLanding'))
      .toEqual(['/Users/noanborel/Yappr', '/Users/noanborel/Yappr/YapprLanding'])
  })

  it('keeps paths containing spaces intact', () => {
    // The reason -F exists. The human format is column-aligned and any
    // macOS path with a space in it parses wrong.
    expect(parseLsofCwds('n/Users/me/My Projects/thing')).toEqual(['/Users/me/My Projects/thing'])
  })

  it('dedupes shells sharing a root', () => {
    expect(parseLsofCwds('n/Users/a/x\nn/Users/a/x\nn/Users/a/x')).toEqual(['/Users/a/x'])
  })

  it('ignores non-path and non-n lines', () => {
    expect(parseLsofCwds('p123\nfcwd\nnRELATIVE\n')).toEqual([])
  })
})
