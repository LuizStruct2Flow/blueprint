# PLAN — TASK-067: shell to TypeScript, organically

**Founder decision, 2026-09-21:** *"I want to migrate all sh files to
typescript, but I don't want to do a big bang epic, but do it organically, all
new features need to be done in typescript, if we need to change a shell file,
we migrate it to typescript."*

The decision is made. This plan settles **how**, and is for three-provider
consensus review (Architect-1 Claude, Architect-2 Codex, Architect-3 Kimi) before
any rule lands.

**Founder decisions on the two splits, 2026-09-21** (see §"Review synthesis"):

- **Runtime: Node's built-in type stripping on an official Node build.**
- **Granularity: the whole file,** overruling the 2-to-1 majority for the
  subcommand unit, with the cost stated in front of the founder: a one-line fix
  to `scripts/blueprint` means porting all 2,257 lines first. So the
  shrink-plus-dispatch allowance is dropped. A legacy shell file is either
  unchanged or gone, and the only changed shell the gate accepts is an exact
  two-line shim. **Consequence for sourced libraries:** porting `roster.sh`
  while shell scripts still source it means those callers reach the port
  through its CLI (a process boundary). The first such port designs that
  interface once, in `scripts/lib/`, for every later caller.

## The rule, as it will be written

1. **New code is TypeScript.** A new script, library or gate stage is `.ts`.
2. **A shell file you must change is migrated first.** The migration is its own
   commit, behaviour-identical and proven by the existing suites. The change
   the item actually wanted comes after it, so a reviewer can tell a port from a
   fix.
3. **No big bang.** Nobody migrates a file that no item needs to touch.

## Facts measured before designing (2026-09-21)

- **62 tracked shell files; 14,587 lines ship** (excluding `docs/` and `tests/`).
  The largest: `scripts/blueprint` 2,257, `.githooks/pre-push` 830,
  `scripts/install-toolchain.sh` 808, `scripts/agent-activity.sh` 794,
  `scripts/lib/dod-gate.sh` 573, `scripts/lib/pipeline.sh` 562.
- **No TypeScript ships today.** Every `.ts` file is under `tests/`, run by
  vitest; `tsc` exists only in `tests/node_modules`.
- **`node file.ts` does not work on this machine.** Node 22.22.1 here is the
  distro build: plain `node` rejects type annotations, and
  `--experimental-strip-types` fails with `ERR_NO_TYPESCRIPT` ("not compiled
  with TypeScript support"). An official Node build would strip types natively.
  So the runtime cannot be assumed; it has to be chosen.
- Shell runs in places that constrain the choice: git hooks (`.githooks/*`),
  Claude Code hooks (`no-chain-guard.sh` runs on EVERY Bash call, so its
  startup cost is paid constantly), the single-quoted wake commands run by
  `sh -c`, and `install-toolchain.sh`, which installs the toolchain and so runs
  before any Node exists.
- These scripts ship to every derived project through `blueprint pull`, so a
  runtime requirement here is a requirement on every project's machines and CI.

## Questions for the reviewers

Answer each with a recommendation and why. Real, practical points only (DoD 1b
rule 4).

1. **Runtime.** Options: (a) `tsx` as a pinned dependency; (b) require an
   official Node with native type stripping, installed by
   `install-toolchain.sh`; (c) compile with `tsc` to committed or built JS;
   (d) Bun or Deno. Weigh: derived projects and CI, startup latency (the
   no-chain hook), supply chain (a new dependency is an OSV/semgrep surface),
   and that a derived project may not be a Node project at all.
2. **Granularity of "the file".** The rule says a shell file that changes is
   migrated. `scripts/blueprint` is 2,257 lines; a one-line bug there would
   mean porting the whole CLI first. Is the unit the file, or the function /
   subcommand being changed (with the shell file shrinking to a dispatcher that
   calls the migrated part)? Recommend one and say what it costs.
3. **What stays shell, if anything.** Candidates: `install-toolchain.sh`
   (bootstraps the runtime), thin git-hook and Claude-hook entry shims, the
   wake-command strings. An exception list must be closed and stated, or the
   rule erodes.
4. **Where TypeScript lives and how it is checked.** Location (`scripts/**/*.ts`
   beside the shell?), tsconfig, and how the existing gate stages
   (`typecheck · TASK-031`, ShellCheck `TASK-033`, semgrep) extend to it.
   The typecheck today covers `tests/` only.
5. **Enforcement, not prose.** How the gate refuses a new `.sh` file and a
   modified-but-unmigrated one, and how the exception list is pinned. This is
   TASK-062's point: a rule only an agent remembers is the weak form.
6. **Proof of a behaviour-identical port.** The suites run shell scripts as
   subprocesses. Is "the existing suite passes against the port, and a mutant
   of the port is caught" sufficient, or does a port need more?

## Review synthesis (2026-09-21)

Reviewed independently by Christian (Architect-1, Claude), Alexey (Architect-2,
Codex) and Slava (Architect-3, Kimi). Where the reviewers split, the synthesis
follows the majority, and the losing argument is recorded.

### Agreed by all three

- **No `tsx`, no Bun or Deno.** Scripts import only `node:` builtins, and they
  have no runtime npm dependency, because they must run before `npm ci`.
- **The typecheck uses the pinned `tests/node_modules/.bin/tsc`, never `npx`.**
  The `typecheck · TASK-031` stage gains a second project (`scripts/`), with
  `tests/tsconfig.json`'s strictness. CI calls the same function.
- **TypeScript lives beside the shell it replaces**, in `scripts/` and
  `scripts/lib/`. It needs no new shipping mechanism.
- **Script paths are a public interface**: `settings.json` hooks, allowlists,
  derived projects' `settings.project.json`, suites, docs and CI all use them. A
  migrated entry point therefore keeps its path as a fixed two-line
  `exec node …` shim.
- **These stay shell, closed list:**
  - `scripts/install-toolchain.sh` (and the libs it sources, while it sources
    them), because it detects the runtime.
  - `scripts/no-chain-guard.sh`. It runs on every Bash call and fails closed:
    ~7 ms in bash against 36-67 ms in Node, and a broken Node would block every
    call, including the one that repairs Node.
  - The git-hook entry points, as shims.
- **The wake commands are not files**, and the rule does not reach them. They
  call scripts by path, and a shim keeps them working.
- **Enforcement is a committed inventory, not a diff heuristic.** It lists every
  remaining shell file with its blob hash, plus the pinned exceptions. A gate
  stage refuses:
  - a shell file that is in the inventory under neither list (a new one);
  - a legacy file whose hash changed (changed without being migrated);
  - an inventory row whose file is gone.

  CI runs the same check. The inventory only shrinks.
- **A port is its own behaviour-identical commit, touching no test, and a
  passing suite is not proof enough.** The port also needs an old-versus-new
  differential run over a fixture corpus comparing exit code, stdout, stderr and
  file effects, plus one mutant proving the suite executes the port. The
  requested change follows in the next commit.

### Split 2 to 1: taken to the founder (runtime confirmed; granularity overruled to whole file)

1. **Runtime: Node's native type stripping on an official Node build (Christian,
   Slava).** `install-toolchain.sh` gains a capability probe (run a one-line
   typed file), not an install, which keeps its "Node belongs to the version
   manager" posture. `engines.node` rises to the first release that strips types
   by default, verified against that official build before it is written down
   (believed to be 22.18). The CI `setup-node` pin moves with it.
   `erasableSyntaxOnly` makes `tsc` refuse what Node would refuse. Measured: 36
   ms per call natively against 246 ms for tsx, and the official build starts in
   10 ms against the distro build's 54 ms.
   *Alexey argued for committed compiled JS,* verified byte-for-byte against a
   rebuild, because requiring an official build would reverse the installer's
   no-install posture. The probe answers that: it installs nothing. Compiled JS
   stays the fallback if an official Node cannot be required.
   **The price: this machine's `/usr/bin/node` must be replaced on PATH,
   including the PATH that non-interactive hook shells see.**
2. **Granularity: the unit is the smallest process boundary that contains the
   change (Christian, Slava).**
   - For a standalone script, the unit is the whole file.
   - For `scripts/blueprint`, the unit is a subcommand. Its `case` arm becomes
     `exec node blueprint-<cmd>.mts`, and the shell shrinks to a dispatcher
     until the last arm leaves.
   - A sourced library migrates when its last shell caller has.
   - The inventory accepts a re-hashed legacy file only when it got SHORTER and
     gained a Node dispatch.

   *Alexey argued for the whole file:* extracting part of a shell file into a
   child process changes its globals, traps, cwd and exit semantics, and a mixed
   dispatcher is a loophole. The majority's answer is that whole-file makes a
   one-line fix to `scripts/blueprint` cost a 2,257-line port. Agents would then
   avoid the largest files, and the rule would erode exactly where it matters.
   The shrink-plus-dispatch check closes the loophole.

### Split, settled by the Orchestrator on the evidence

- **`.mts`, not `.ts`, with `scripts/tsconfig.json` (Christian).** `.ts` needs a
  `scripts/package.json` marked `"type":"module"` (measured: TS1295/TS1470
  without it). That would be a managed file in a directory derived projects also
  use. A root `tsconfig.json` (Slava) fails the same way: the root belongs to the
  project (TASK-020).
- **`.githooks/pre-push` becomes a shim, and its logic migrates when touched
  (Alexey, Slava).** Christian would keep the whole file shell, citing TASK-018
  §3.3. That ruling kept the gate's ENTRY in shell so a missing toolchain fails
  closed, and a shim that checks Node and fails closed keeps that property. For
  the same reason, `scripts/run-ts-suites.sh` joins the exception list: it
  reports a missing `tests/node_modules`.
- **The inventory check runs in the blueprint only (Christian).** Downstream,
  managed scripts are placeholder-substituted, so every hash would differ. A
  derived project's own shell is its own decision, and changes to managed
  scripts reach the blueprint through `a2bp`, where this gate applies.
- **Local semgrep adds `p/typescript` and `p/javascript` (Alexey)**, which CI
  already runs, so TypeScript gets the same SAST in both places.

## Not in scope

Migrating anything. The first port happens inside the first item that needs to
change a shell file, after this plan has consensus and the founder approves it.
