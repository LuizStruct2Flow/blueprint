---
marp: true
theme: default
paginate: true
size: 16:9
footer: 'Luiz Scheidegger · luiz@struct2flow.com'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --teal: #006B5F;
    --teal-700: #006B5F;
    --teal-500: #0F8F80;
    --teal-300: #66B3A8;
    --teal-100: #CCE5E1;
    --teal-50:  #E6F2F0;
    --ink: #0A0A0A;
    --ink-soft: #1d1d1b;
    --paper: #FAFAF7;
    --muted: #6B6B66;
    --amber: #8A5A00;
    --amber-50: #FDF6E8;
  }

  section {
    background: var(--paper);
    color: var(--ink);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 21px;
    line-height: 1.4;
    padding: 44px 60px 56px;
  }

  section h1, section h2, section h3 {
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    color: var(--ink);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.2;
  }

  section h1 {
    border-bottom: 3px solid var(--teal);
    padding-bottom: 8px;
    margin: 0 0 18px;
    font-size: 32px;
  }

  section h2 {
    color: var(--teal);
    font-size: 22px;
    font-weight: 500;
    margin: 12px 0 6px;
  }

  section p { margin: 8px 0; }

  section strong { color: var(--teal); font-weight: 600; }

  section blockquote {
    font-style: italic;
    color: var(--ink);
    border-left: 4px solid var(--teal);
    background: var(--teal-50);
    padding: 10px 18px;
    border-radius: 0 6px 6px 0;
    margin: 10px 0;
  }

  section code {
    background: var(--teal-50);
    color: var(--teal);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.86em;
  }

  section pre {
    background: var(--ink);
    color: var(--paper);
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 15px;
    line-height: 1.45;
    padding: 12px 18px;
    border-radius: 6px;
    margin: 10px 0;
  }

  section pre code {
    background: transparent;
    color: var(--paper);
    padding: 0;
    font-size: inherit;
  }

  section table {
    font-size: 18px;
    border-collapse: collapse;
    margin: 8px 0;
  }

  section th {
    background: var(--ink);
    color: var(--paper);
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 600;
    padding: 7px 12px;
    text-align: left;
  }

  section td {
    padding: 7px 12px;
    border-bottom: 1px solid var(--teal-100);
  }

  section ul, section ol { margin: 6px 0; padding-left: 28px; }
  section li { margin: 3px 0; }

  /* Logo top-right on body slides — smaller + higher so it doesn't crash into H1 */
  section::before {
    content: '';
    position: absolute;
    top: 18px;
    right: 28px;
    width: 42px;
    height: 42px;
    background-image: url('assets/brand/struct2flow-mark.svg');
    background-repeat: no-repeat;
    background-size: contain;
    background-position: right top;
    opacity: 0.85;
  }

  /* Pagination */
  section::after {
    color: var(--muted);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px;
    font-weight: 500;
  }

  footer {
    color: var(--muted);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px;
  }

  /* Lead (title / divider / closing) slides */
  section.lead {
    background: var(--ink);
    color: var(--paper);
    text-align: center;
    justify-content: center;
  }

  section.lead h1 {
    color: var(--paper);
    border: none;
    font-size: 68px;
    margin-bottom: 16px;
    padding-bottom: 0;
  }

  section.lead h2 {
    color: var(--teal-300);
    font-size: 32px;
    font-weight: 500;
  }

  section.lead p, section.lead a { color: var(--teal-50); }
  section.lead strong { color: var(--teal-300); }

  /* Logo top-left on lead slides, recoloured to paper via filter */
  section.lead::before {
    top: 32px;
    left: 40px;
    right: auto;
    width: 64px;
    height: 64px;
    background-position: left top;
    filter: invert(98%) sepia(2%) saturate(180%) hue-rotate(40deg) brightness(102%) contrast(91%);
    opacity: 1;
  }

  section.lead footer { color: var(--teal-300); }

  /* A measured number, stated large. */
  section .stat {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 68px;
    font-weight: 700;
    color: var(--teal);
    line-height: 1;
  }

  section.lead .stat { color: var(--teal-300); font-size: 96px; }

  /* A trap: seductive, and worth naming out loud. */
  section .trap {
    border-left: 4px solid var(--amber);
    background: var(--amber-50);
    padding: 10px 18px;
    border-radius: 0 6px 6px 0;
    margin: 10px 0;
  }

  section .trap strong { color: var(--amber); }

  section .small { font-size: 17px; color: var(--muted); }
---

<!-- _class: lead -->

# Write your own
# blueprints

## Guardrails that execute, for teams of engineers and agents

**Lessons from building one — and measuring it**

---

# The claim

> With several engineers and several agents working across your projects,
> **your best practices have to exist as repeatable, enforced,
> evolving controls in the repository.**

<br>

Not in a wiki. Not in an onboarding deck. Not in three people's heads.

**This talk is the evidence, and the traps on the way.**

---

# Where does the truth live?

Pick your organisation. Where is the authoritative answer to *"how do we build software here"*?

- A wiki space, last edited 14 months ago
- An onboarding deck
- The three people who have been here longest

**None of those can enforce anything.** They can only be *consulted* — by someone who already knows to look.

---

# What changes with agents

An engineer who cannot find the rule asks a colleague.

An agent who cannot find the rule **produces confident, well-formed, non-compliant work** — fast, and at volume.

<br>

Multiply by *n* engineers and *m* agents, each with its own context. The gap between *what we agreed* and *what ships* stops being a documentation problem.

**It becomes a control problem.**

---

# "But our projects are all different"

They are not. Not at the level that matters.

Look across your projects. Most of them are one of a handful of recurring shapes:

**headless microservice · backend-for-frontend · event-driven system · anti-corruption layer · back-office system**

<br>

What differs is **business rules, domain language, and detail.**
What does not differ is **the shape** — layering, transport, idempotency, observability, deployment, test strategy.

---

# Which is what makes this possible

> Treating every project as an exotic singleton means
> **re-deciding the 80% that was never in question** —
> and re-deciding it differently each time.

<br>

The shared part is not a rounding error. **It is most of the work**, and it is the part where inconsistency costs you the most and buys you nothing.

**That is the part worth encoding.**

---

<!-- _class: lead -->

# Part 1

## Why review cannot be your compliance control

---

# The naive model

> "We enforce our standards through code review."

I believed this. I ran it. **I was the reviewer.**

<br>

Then I stopped asking whether our rules were *good*, and started asking whether they were **enforced** — which turns out to be a measurable question.

---

# The method

Two agents walked our two normative documents line by line. A third, on a **different provider**, audited the highest-consequence rules independently.

One question per rule:

> **What mechanism enforces this, and can you make it fail?**

<div class="stat">309</div>

**rules inventoried.** Every normative line in `CLAUDE.md` and `docs/DoD.md`.

---

# The result

<div class="stat">233 / 309</div>

**had no mechanism at all** — prose in an agent's context, nothing more.

<br>

Uncomfortable, but not the interesting number. **Rules without mechanisms are a known problem with a known fix.**

The interesting result was among the rules that *did* have one.

---

# The defect that reading cannot catch

**A check can pass because the thing it examines is _absent_ rather than _correct_.** It prints `PASSED`, always has, and will keep doing so after the code it guards is deleted.

Live in my repo when I looked:

- A gate that enforced nothing on macOS — one `sed` alternation in GNU-only syntax
- An assertion that printed its own failure 28 times and **exited 0**
- A coverage rule scoped to two directories **that have never existed here**

**Every one passed review. Repeatedly. One survived five rounds** — each reviewer read the shell and the TypeScript separately, and the defect lived in the seam.

---

# Review and execution catch different things

| | Catches | Misses |
|---|---|---|
| **Review** | wrong logic, bad design, unclear naming | a control examining something absent |
| **Execution** | a control that cannot fail | intent, taste, architecture |

<br>

**Complements, not substitutes.** Asking review to enforce compliance asks it to do the one thing it structurally cannot.

<span class="small">This is not a story about weak reviewers. A reviewer sees a well-formed assertion. Only running it distinguishes one that can fail from one that cannot.</span>

---

# I had this written down

Line 215 of my own pitch deck. Written in good faith. Presented to real people:

> "Everything below is **enforced by tooling**, not memos.
> The rules live in code (hooks, scripts, gates) — not in slides."

**The claim was itself a memo.**

<span class="small">If that can happen inside a deck whose entire subject is enforcement, assume it is happening in yours.</span>

---

<!-- _class: lead -->

# Part 2

## Several engineers. Several agents.

---

# The fleet is already mixed

On this project, work is done by personas backed by **Claude Code, Codex, Gemini and Copilot**, coordinated through a roster in the repo.

That is not exotic — it is where most teams already are: **different engineers, different subscriptions, different agents, one codebase.**

**So ask the question that decides everything about a guardrail:** *which of them does it actually bind?*

---

# The layer decides the reach

Same 309 rules, one different question.

| Enforced by | Binds | Rules |
|---|---|---|
| nothing — prose only | nobody | **233** |
| a git hook | everyone, *if* hooks are armed | **67** |
| a setting inside one agent's own client | that one agent | **8** |
| CI | everyone, unconditionally | **1** |

<span class="small">"Inside one agent's own client" means a file only that tool reads — <code>.claude/settings.json</code>, a Cursor rule, a Copilot instructions file. No other agent honours it.</span>

---

# The anecdote that proves it

Our "no chained shell commands" rule is enforced by a hook inside one agent's client. It is one of the few rules everybody believed was enforced.

The **Codex** auditor reported:

> "It does not govern Codex `exec_command` calls directly.
> **I complied by splitting commands** — but this tool surface
> is outside that hook."

**An agent obeyed by discipline, in the session auditing whether rules are obeyed by discipline.**

---

# So there is only one place to put a guardrail

Per-engineer setup drifts silently and privately.
A setting in one agent's client binds one agent.
Documentation binds nobody.

<br>

> The **repository** is the only place every engineer
> and every agent has to go through.

**Git hooks and CI are the only two layers that bind all of them.** Multi-agent work does not merely benefit from a shared blueprint — **it has nowhere else to put a rule.**

---

<!-- _class: lead -->

# Part 3

## Making a mixed fleet actually work

---

# One log. Every agent. `tail -F`

Every agent — whatever provider backs it — appends to one feed, tagged with persona and backing agent.

```
tail -F logs/agent-activity.log
```

- You watch the work **as it happens**, not in a summary written by the thing that did it
- A stalled or looping agent is obvious in seconds
- Attribution is free: which persona, which provider, which action

**Cheapest observability you will ever add, and it is on your own fleet.**

<span class="small"><code>-F</code>, not <code>-f</code> — follows by name, so it survives rotation.</span>

---

# Alternate the provider on every pass

```
 Claude          Codex            Claude           Codex
  code    →   review + fix   →  review + fix  →  review + fix  →  converged
```

**Two properties it stands on:**

1. **The provider rotates.** A model's blind spots correlate with itself — a second pass by the same model re-reads with the same priors.
2. **Every pass must _fix_, not just report.** An agent obliged to make the change cannot hide behind a vague finding.

<span class="small">A design I am adopting, not a measured result. What I have run is the parallel version — several providers auditing the same thing independently — and four of my most useful findings came only from the diff between them. The sequential relay reasons from the same premise. It is not yet proven.</span>

---

<!-- _class: lead -->

# Part 4

## What actually goes in one

---

# Controls, not chapters

Every guardrail is something that runs and can **refuse**.

| Concern | Anchored as |
|---|---|
| Commit hygiene | `commit-msg` hook — rejects the commit |
| Definition of Done | pre-push stages over the outgoing commits |
| Secrets, SAST, CVEs | scanners on every push, blocking |
| Regression coverage | a manifest that fails if a suite is not invoked |

<br>

**If a rule cannot refuse anything, it is documentation. Label it as such.**

---

# A lifecycle work moves through

```
backlog/  →  doing/  →  waiting-acceptance/  →  done/
         promote     lands on main        owner accepts
```

Four states, three owner-gated. **The folder is the status field** — no separate tracker to fall out of sync with the tree.

Nothing reaches `done/` because an agent decided it was finished.

---

# An export boundary

Two kinds of code live in a blueprint, with opposite rules:

- **Internal machinery** — bootstrapping, sync, the export logic itself. **No derived project ever runs it.**
- **Scaffolding** — tests, config and controls that **travel** to every project.

Conflating them is how project-specific logic ends up in generic files.

**Make the boundary a mechanism, not a judgement call per file.**

---

# A sync model with a direction

Capabilities flow **down** to every project. Improvements flow **up** as *requests*.

> A back-propagation is a **request**, not a delivery.

The upstream command pushes a branch and opens a pull request. It writes into no working tree. **It lands nothing.**

Someone with the whole blueprint in front of them decides whether one project's lesson is genuinely generic.

---

# Derived, not designed

1. A project hits a real requirement — an incident, a customer ask, a bug nothing existing could have caught
2. It builds the fix and captures the pattern
3. Once the pattern survives production, the generic core travels up
4. The next project inherits it as a **default**

<br>

**Do not design your blueprint from first principles.** You will encode guesses, and guesses are what rot.

---

<!-- _class: lead -->

# Part 5

## Six traps

**Each cost me real time. None need cost you any.**

---

# Trap 1 · Controls in a language you don't read

Our gate and its ~45 suites were shell. Shell is not my stack.

So I stopped reading the controls and started reviewing **outcomes** (`PASSED`) instead of **mechanisms**.

<div class="trap">
<strong>Every defect on the Part 1 slides lived in code I had stopped reading.</strong>
</div>

**Do instead:** write controls in your team's primary language — not for elegance, because *you cannot own a control you cannot read.*

---

# Trap 2 · Sync without a direction

Our upstream command used to copy a file straight into the blueprint's tree. So **every derived project was a writer to the shared blueprint.**

One project's paths and config fanned out to every other project on their next pull. Traceably, twice.

<div class="trap">
My own deck sold this as a feature: <strong>"The flow is bidirectional."</strong>
</div>

**Do instead:** bidirectional was never the goal — **curated** was. Requests up, capabilities down, a human in between.

---

# Trap 3 · Agents without a reader

For a stretch I could not work on the blueprint or its derived projects, so I left the agents running mostly unattended. They did not stop working. They overcomplicated, and they developed their own language.

<div class="trap">
Reading the bug reports on my own project <strong>made me doubt my English.</strong>
</div>

Nothing was factually wrong. Every artefact was well-formed. **And the project had become foreign to the person accountable for it.**

**Do instead:** treat comprehensibility as load-bearing. An artefact its owner cannot read will not be reviewed.

---

# Trap 4 · Lists you maintain by hand

A control that checks *"everything in this list"* is blind to whatever is not in the list. Three separate incidents:

- A test manifest anchored on `*.sh` — invisible to `.ts` suites
- A propagation check over a hand-written subset — one file shipped alone to every project and broke their CI on first push
- Rows scoped to one tier — enforcing nothing on the other

**Do instead:** derive the set from the filesystem. Then failing to enumerate something is not expressible.

---

# Trap 5 · Budgets that quietly decide coverage

We had a 30-second ceiling on the pre-push gate. **It started making coverage decisions.**

A suite guarding the exact door two incidents came through grew from 2.3 s to 6.0 s — and the cheapest way to satisfy the budget was to move it out of the gate. The gate still said *all checks passed*, just over less.

**Do instead:** decide coverage on risk, never on the clock. When a suite is slow, fix the suite — one went **125 s → 37 s** with every assertion intact, once someone asked *why* instead of *where to put it*.

---

# Trap 6 · Assertions never proven to fail

The trap that generates all the others.

**A test you have never watched go red is a hypothesis, not a control.**

<br>

**Do instead:** mutate the mechanism, watch the test fail, record it. Every assertion, once.

> Adopt exactly one thing from this talk? Adopt this.
> It is cheap, and it is the only defence against the whole Part 1 category.

---

<!-- _class: lead -->

# Part 6

## Audit your own

---

# The method, transferable

Runnable on your own projects this week, with no new tooling.

1. **Enumerate** every normative line in your standards docs. Count them.
2. For each: **name the mechanism** — `file:line` — or write `NONE`.
3. For each mechanism: **make it fail.** If you cannot, it is not a control.
4. Record **who and what it binds** — one agent's own config, a git hook, or CI.
5. Sort into: *mechanise* / *already fine* / *keep but stop claiming enforcement* / *delete as aspiration*.

**Use two providers and make them converge.** Where they disagree, your truth is least certain.

---

# What the audit told me to do

| Disposition | Rules | |
|---|---|---|
| **Mechanise** | 169 | worth a real control |
| **Already fine** | 52 | a mechanism exists and was proven to fire |
| **Keep, stop claiming** | 52 | real rule, honestly unenforceable |
| **Delete as aspiration** | 36 | describes a project this is not |

<br>

**88 rules get downgraded or deleted.** That is the deliverable, not a concession — a small honest protocol beats a large decorative one.

---

# My scoreboard, so yours has a reference

<div class="stat">62 / 309</div>

**enforced by a mechanism that both actually runs and is not tied to one agent.**

<br>

Low — and **the first time the number existed.** A month ago the honest answer was *"most of them, I think."*

> **Knowing the number is the whole difference.**
> You cannot ratchet a number you have never measured.

---

<!-- _class: lead -->

# Part 7

## Write your own

---

# Why yours, and not mine

A blueprint encodes **your** architecture, **your** Definition of Done, **your** security posture, **your** incidents.

And it must be **derived** — grown from requirements you actually hit. Adopting someone else's wholesale hands you controls for problems you have never had, and none for the ones you have.

<br>

Trap 1 again, one level up:

> **A blueprint you did not build is documentation.**
> You will not read it, and you will not own it.

---

# Blueprint what your projects share

Do not start with a grand standard. Start where you are about to solve the same problem twice.

- **A technology you are standardising on** — adopting Kafka? Blueprint the **outbox pattern**, consumer idempotency, DLQ handling, schema evolution
- **Test harnesses** — fixtures, isolation, determinism
- **UI libraries and kits** — components, tokens, accessibility defaults
- **Agentic coding standards** — the guardrails themselves. **Especially this one.**

**Each is a place the second project should not re-derive the first project's lessons.**

---

# One blueprint does not scale

I have **one**. That works because they are my projects and they follow my standards.

**At organisation scale, one blueprint becomes a monolith — then a monster.** Every team's exception has to live in it, it grows past what anyone can hold, and the controls that matter get buried under the ones that do not.

**You want several: specialised, composable, separately owned.**

- one per **archetype** — event-driven, backend-for-frontend, back-office
- one per **adopted technology** — Kafka, your cloud, your UI kit
- one for **agentic-coding standards**, which every project pulls

<span class="small">My own numbers argue it: 309 rules, 88 being deleted — a single blueprint straining at pet-project scale.</span>

---

# What I would ask you to take away

1. **Your projects are not singletons.** A handful of shapes covers most of them — that shared part is what you encode.
2. **Review is a complement, not a control.** It cannot see a check that examines nothing.
3. **The layer decides the reach.** One agent's config, a git hook, or CI — only the last two bind everybody.
4. **Rotate the provider, and make each pass fix rather than report.** Where two providers disagree is where your code is misleading.
5. **Measure what is enforced.** The number will be lower than you expect, and having it is the entire difference.

---

<!-- _class: lead -->

# The one sentence

## An agent will follow the rules you enforce,
## not the rules you write.

**Put them in the repository, make them refuse things,
and let your incidents grow them.**

---

<!-- _class: lead -->

# Thank you

**Luiz Scheidegger**
luiz@struct2flow.com

<span class="small">Every number here comes from an audit of the live repository,<br>reproducible from <code>docs/doing/TASK-022-rule-enforcement.xlsx</code></span>
