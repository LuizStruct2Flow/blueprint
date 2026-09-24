/**
 * tests/harness/dump.ts — process-tree evidence capture for a scenario wait
 * that times out (BUG-146).
 *
 * tests/sync-by-address #20d has hung ~320s in CI three times (BUG-120 row:
 * 61cfe01, 374a8d9, c7c47f6) and never once locally (162+ runs, including
 * under `taskset -c 0-3`). 320019-320024ms is not a wait budget anything in
 * the test chose — it is tests/vitest.config.ts's global `testTimeout`
 * (320_000ms) killing the test from outside while something it awaits never
 * settles. Nothing was captured at that moment, so each occurrence taught
 * nothing beyond "it happened again". This module is the capture: a scenario
 * races a wait against ITS OWN, much shorter timeout (`waitOrDump` in
 * index.ts) so it fails fast, WITH the process tree it was waiting on written
 * to a file first.
 *
 * Generic on purpose — this has nothing #20d-specific in it. Any scenario
 * wait, in any suite, can use `waitOrDump` and get the same capture.
 */

import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, readlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface ProcRow {
  pid: number
  ppid: number
  stat: string
  wchan: string
  args: string
}

/** Parse `ps -eo pid,ppid,stat,wchan:32,args` output into rows. */
function parsePs(output: string): ProcRow[] {
  const rows: ProcRow[] = []
  for (const line of output.trim().split('\n').slice(1)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!m) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), stat: m[3]!, wchan: m[4]!, args: m[5]! })
  }
  return rows
}

/** Every pid in `roots` plus every descendant, walking `ppid` links. */
function withDescendants(all: ProcRow[], roots: number[]): ProcRow[] {
  const byPpid = new Map<number, ProcRow[]>()
  for (const row of all) {
    const list = byPpid.get(row.ppid) ?? []
    list.push(row)
    byPpid.set(row.ppid, list)
  }
  const wanted = new Set(roots)
  const queue = [...roots]
  while (queue.length > 0) {
    const pid = queue.shift() as number
    for (const child of byPpid.get(pid) ?? []) {
      if (wanted.has(child.pid)) continue
      wanted.add(child.pid)
      queue.push(child.pid)
    }
  }
  return all.filter((row) => wanted.has(row.pid))
}

/** A /proc/<pid>/<name> read that reports why it failed rather than throwing —
 * a dump that cannot read a stack is still evidence; one that crashes trying
 * to read it is worse than the hang it was meant to explain. */
async function readProcFile(pid: number, name: string): Promise<string> {
  try {
    const text = await readFile(`/proc/${pid}/${name}`, 'utf8')
    return text.trim() || '(empty)'
  } catch (err) {
    return `<unreadable: ${(err as Error).message}>`
  }
}

async function listFds(pid: number): Promise<string[]> {
  try {
    const entries = await readdir(`/proc/${pid}/fd`)
    const out: string[] = []
    for (const entry of entries) {
      const target = await readlink(`/proc/${pid}/fd/${entry}`).catch(
        (err: Error) => `<unreadable: ${err.message}>`,
      )
      out.push(`${entry} -> ${target}`)
    }
    return out
  } catch (err) {
    return [`<unreadable: ${(err as Error).message}>`]
  }
}

/**
 * Render the process tree rooted at `rootPids` — a scenario's own tracked
 * process groups — as text: `ps`'s pid/ppid/state/wchan/args, plus
 * `/proc/<pid>/wchan` and `/proc/<pid>/stack` (Linux; `stack` needs root and
 * is usually "<unreadable>" outside it — reported, not hidden), plus each
 * process's open fds ("cheap" here because a scenario's own tree is a
 * handful of processes, not the whole machine's).
 *
 * Never throws. A capture that fails must not mask the timeout it exists to
 * explain — the caller's original error is what propagates either way.
 */
export async function dumpProcessTree(rootPids: number[], label: string): Promise<string> {
  const lines: string[] = [
    `# process-tree dump: ${label}`,
    `# generated: ${new Date().toISOString()}`,
    `# roots (this scenario's tracked process groups): ${rootPids.join(', ') || '(none)'}`,
    '',
  ]
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid,stat,wchan:32,args'])
    const all = parsePs(stdout)
    const tree = rootPids.length > 0 ? withDescendants(all, rootPids) : []
    if (tree.length === 0) {
      lines.push('(nothing found under the tracked roots — every tracked process had already exited)')
    }
    for (const row of tree) {
      lines.push(`pid=${row.pid} ppid=${row.ppid} stat=${row.stat} wchan(ps)=${row.wchan} args=${row.args}`)
      lines.push(`  /proc/${row.pid}/wchan: ${await readProcFile(row.pid, 'wchan')}`)
      lines.push(`  /proc/${row.pid}/stack: ${await readProcFile(row.pid, 'stack')}`)
      const fds = await listFds(row.pid)
      lines.push(`  fds: ${fds.length}`)
      for (const fd of fds) lines.push(`    ${fd}`)
      lines.push('')
    }
  } catch (err) {
    lines.push(`ps failed: ${(err as Error).message}`)
  }
  return lines.join('\n')
}

/**
 * Where a dump lands. NEVER inside a scenario's own workspace — `dispose()`
 * (workspace.ts) removes it, and asserts the removal, regardless of whether
 * the scenario body failed. `BP_HARNESS_DUMP_DIR` overrides the default, and
 * MUST be set explicitly by a scenario that runs a NESTED harness (a
 * bootstrapped project's own vitest, as tests/bootstrap-gate does): the
 * nested process's own `REPO_ROOT` resolves inside the outer scenario's
 * workspace, which is exactly what gets removed once the outer `s.run` that
 * started it returns. Pointing the nested run at the OUTER repo's own
 * `tests/.timeout-dumps` (this module's `REPO_ROOT`, imported by the caller)
 * is what makes a nested hang's dump survive; see
 * tests/bootstrap-gate/bootstrap-gate.release.spec.ts.
 */
export function dumpDir(repoRoot: string): string {
  return process.env.BP_HARNESS_DUMP_DIR || join(repoRoot, 'tests', '.timeout-dumps')
}

/** Write a dump to `dir`, one file per timeout, and return its path. */
export async function writeDump(dir: string, label: string, text: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const safe = label.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80)
  const file = join(dir, `${safe}-${process.pid}-${Date.now()}.txt`)
  await writeFile(file, text, 'utf8')
  return file
}
