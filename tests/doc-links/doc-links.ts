/**
 * tests/doc-links/doc-links.ts — does every relative link under docs/ resolve?
 *
 * WHY IT IS A MODULE AND NOT INLINE IN THE SPEC. The spec has to run this over
 * two populations: the REAL docs tree, where it must be green, and a set of
 * perturbed trees, where each perturbation must turn it red. One
 * implementation aimed at both is the only version where a green real tree
 * means what it says — two would agree by coincidence, which is the A-09 shape
 * this repo keeps rediscovering.
 *
 * FIDELITY NOTE, because this is a port and "ported" is a claim. The retiring
 * `tests/doc-links/test.sh` extracted links with
 *
 *     sed -e '/^```/,/^```/d' -e 's/`[^`]*`//g' | grep -oE '\]\([^)#][^)]*\)'
 *
 * and every quirk of that pipeline is reproduced here on purpose, including the
 * ones that look like bugs:
 *
 *   - A target may not contain `)`. `[x](a(1).md)` is not seen at all. Widening
 *     it would be a behaviour change smuggled in under a migration, so it is
 *     recorded instead (see the spec's equivalence record).
 *   - `sed` ranges RESTART, so an odd number of fence lines deletes from the
 *     last fence to end of file. Matched.
 *   - Code spans are stripped AFTER fenced blocks and LINE BY LINE, so a
 *     backtick opened on one line and closed on the next strips nothing.
 *
 * The one deliberate difference is the file order: `find | sort` vs. a
 * recursive walk sorted by full path. It changes the order broken links are
 * reported in, never the set.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { declaration } from '../helpers/project-config.js'

export interface DocLinkScan {
  /** How many relative links were examined. The non-vacuity number. */
  readonly examined: number
  /** `<file> -> <target>` for each link that does not resolve. */
  readonly broken: readonly string[]
}

/** Every `*.md` under `dir`, recursively, sorted by path. */
async function markdownFiles(dir: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (d: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith('.md')) found.push(full)
    }
  }
  await walk(dir)
  return found.sort()
}

/**
 * Strip fenced blocks, then inline code spans — in that order, per line.
 *
 * Inline code is stripped because `` `[AGENT_ROSTER.md](AGENT_ROSTER.md)` ``
 * inside backticks is a file QUOTING a link, i.e. documentation ABOUT a link.
 * The first version of the shell check reported those, and a guard that calls
 * correct prose broken is one people learn to ignore.
 */
function strippedLines(content: string): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    out.push(line.replace(/`[^`]*`/g, ''))
  }
  return out
}

/** Relative link targets in one file's text, anchors already dropped. */
export function relativeLinkTargets(content: string): string[] {
  const targets: string[] = []
  for (const line of strippedLines(content)) {
    // `[^)#][^)]*` — the first character may be neither `)` (an empty target)
    // nor `#` (a pure in-page anchor, which names no file).
    for (const match of line.matchAll(/\]\(([^)#][^)]*)\)/g)) {
      const raw = match[1] ?? ''
      if (/^(https?|mailto:|<)/.test(raw) || raw.startsWith('http')) continue
      const withoutAnchor = raw.split('#')[0] ?? ''
      if (withoutAnchor === '') continue
      targets.push(withoutAnchor)
    }
  }
  return targets
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Scan a docs tree. Returns the count examined and every unresolved target.
 *
 * TASK-045 — A SITE-ABSOLUTE TARGET (`/security.html`) names a served page, not
 * a path on this disk. It resolves only through what the project declares in
 * project_config_paths.md, which sits beside docs/:
 *
 *     - BP_WEB_ROOT: `frontend/public`             a directory the site serves
 *     - BP_WEB_PATHS: `/security.html /terms/v1.html`   pages served from elsewhere
 *
 * With neither, it is reported, so a typo is never accepted by default. It used
 * to be resolved against the filesystem root, which reported every served page
 * and would have accepted `/etc`.
 */
export async function scanDocLinks(docsDir: string): Promise<DocLinkScan> {
  const projectRoot = dirname(docsDir)
  const webRoot = await declaration(projectRoot, 'BP_WEB_ROOT')
  const webPaths = (await declaration(projectRoot, 'BP_WEB_PATHS'))?.split(/\s+/).filter(Boolean) ?? []

  let examined = 0
  const broken: string[] = []

  for (const file of await markdownFiles(docsDir)) {
    const content = await readFile(file, 'utf8')
    for (const target of relativeLinkTargets(content)) {
      examined++
      if (!target.startsWith('/')) {
        if (!(await exists(resolve(dirname(file), target)))) broken.push(`${file} -> ${target}`)
      } else if (!webPaths.includes(target) && !(webRoot && (await exists(join(projectRoot, webRoot, target))))) {
        broken.push(
          `${file} -> ${target} (site-absolute: declare BP_WEB_ROOT or BP_WEB_PATHS in project_config_paths.md)`,
        )
      }
    }
  }

  return { examined, broken }
}
