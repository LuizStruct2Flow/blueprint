/**
 * tests/harness/workspace.ts — a per-scenario temp root that owns its cleanup.
 *
 * Two defects shaped this file, both found by execution:
 *
 *  - BUG-036: macOS `mktemp -d` returns /var/folders/..., while /var is a
 *    symlink to /private/var, so a process's REAL cwd is reported under
 *    /private/var. Three suites compared the two and silently matched nothing —
 *    every "is this process mine?" test counted zero. Every path this harness
 *    hands out is therefore resolved to its PHYSICAL form at creation.
 *  - BUG-049: `BP_CLONE="$(mktemp -d)/bp-clone"` never captured the parent, and
 *    the trap covered only $WORK. 133 MB of leaked blueprint archives, measured.
 *    So a workspace is not a path — it is a handle that knows how to remove
 *    itself, and teardown ASSERTS the removal rather than hoping.
 */

import { mkdtemp, rm, mkdir, realpath, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Workspace {
  /** Physical (symlink-resolved) absolute path to this scenario's root. */
  readonly root: string
  /** Create a directory under the root and return its physical path. */
  dir(...segments: string[]): Promise<string>
  /** A path under the root. Does not create anything. */
  path(...segments: string[]): string
  /** Remove the workspace. Idempotent. Throws if the root survives. */
  dispose(): Promise<void>
}

/**
 * Create an isolated workspace.
 *
 * `label` appears in the directory name so that a leak — should one ever escape
 * the teardown assertion — names the scenario that produced it rather than
 * leaving an anonymous `tmp.XXXX` for someone to bisect.
 */
export async function createWorkspace(label = 'bp'): Promise<Workspace> {
  const safeLabel = label.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40)

  // realpath the system temp dir FIRST. On macOS tmpdir() is /var/folders/...
  // and mkdtemp inherits that symlinked prefix; resolving afterwards would
  // still work, but resolving first means every derived path is physical by
  // construction rather than by remembering to convert.
  const base = await realpath(tmpdir())
  const root = await mkdtemp(join(base, `${safeLabel}-`))

  let disposed = false

  return {
    root,

    path(...segments: string[]): string {
      return join(root, ...segments)
    },

    async dir(...segments: string[]): Promise<string> {
      const target = join(root, ...segments)
      await mkdir(target, { recursive: true })
      return target
    },

    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true

      await rm(root, { recursive: true, force: true, maxRetries: 3 })

      // Assert the removal. BUG-049 was not "cleanup was wrong" but "cleanup
      // was never checked" — 23 leaked archives accumulated while every suite
      // reported success. A teardown that cannot fail is not a teardown.
      let survived = false
      try {
        await stat(root)
        survived = true
      } catch {
        // ENOENT — the expected, correct path.
      }
      if (survived) {
        throw new Error(
          `Workspace survived teardown: ${root}. This is the BUG-049 class — ` +
            `debris accumulates in $TMPDIR and is itself a cross-suite hazard, ` +
            `because a2bp-e2e scans that directory for leaked dirs.`,
        )
      }
    },
  }
}
