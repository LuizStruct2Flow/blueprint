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

**What I learned building one — and measuring it**

---

# The claim

> I believe that once several engineers and several agents work across your projects,
> **your best practices have to live in the repository as controls:
> repeatable, enforced, and evolving.**

<br>

Not in a wiki. Not in an onboarding deck. Not in the heads of three people.

**Let me show you the evidence — and the traps I fell into on the way.**

---

# Where does the truth live?

Think about your own organisation. Where is the answer to *"how do we build software here?"*

- A wiki space, last edited 14 months ago
- An onboarding deck
- The three colleagues who have been here the longest

**None of them can enforce anything.** You can only *consult* them — and only if you already know where to look.

<br>

> ## The truth lives in the code.

---

# What changes with agents

Be super-alert when you hear this one:

> "The agent should know our rules. They are in the wiki."

An engineer who cannot find a rule asks a colleague.
An agent who cannot find a rule **produces confident, well-formed, non-compliant work** — fast, and in big quantities.

Multiply this by *n* engineers and *m* agents, each with its own context. The gap between *what we agreed* and *what we ship* is no longer a documentation problem.

**It is a control problem.**

---

# "But our projects are all different"

I hear this sentence in almost every organisation. And I don't buy it — not at the level that matters.

Take a look at your projects. Most of them are one of a handful of shapes:

**headless microservice · backend-for-frontend · event-driven system · anti-corruption layer · back-office system**

<br>

What differs is **business rules, domain language, and details.**
What does not differ is **the shape** — layering, transport, idempotency, observability, deployment, test strategy.

---

# And this is what makes it possible

> If you treat every project as an exotic singleton,
> **you re-decide the 80% that was never in question** —
> and you decide it differently every time.

<br>

The shared part is not a rounding error. **It is most of the work.** It is also where inconsistency costs you the most and gives you nothing back.

**This is the part worth encoding.**

---

<!-- _class: lead -->

# Part 1

## Why review cannot be your compliance control

---

# The naive model

> "We enforce our standards through code review."

I believed this. I ran it. **I was the reviewer.**

<br>

Then I stopped asking whether our rules were *good*, and started asking whether they were **enforced**. It turns out this is a question you can measure.

---

# The method

Two agents went through our two normative documents, line by line. A third one, from a **different provider**, audited the rules with the highest consequences on its own.

One question per rule:

> **Which mechanism enforces this — and can you make it fail?**

<div class="stat">373</div>

**audited rows today.** Every normative line in `CLAUDE.md` and `docs/DoD.md`, plus controls that only existed as mechanisms, found in the refresh.

<span class="small">The original audit had 309 rows. The accepted refresh added 64 newly written or mechanism-only rules; that is scope growth, not enforcement progress. Excluding 35 rows marked for deletion leaves the 338 live-rule denominator used from here on.</span>

---

# The result

<div class="stat">204 → 189 / 338</div>

**live rules had no mechanism at all** — accepted audit → today.

<br>

The enforcement epic moved **15 rules out of prose-only**. This is real movement — and small enough that I want to be honest about it.

But the interesting part was among the rules that *did* have a mechanism.

---

# The defect you cannot catch by reading

**A check can pass because the thing it examines is _absent_, not because it is _correct_.** It prints `PASSED`, it always did, and it will keep doing so after someone deletes the code it guards.

What I found in my own repository:

- A gate that enforced nothing on macOS — one `sed` alternation in GNU-only syntax
- An assertion that printed its own failure 28 times and **exited 0**
- A coverage rule scoped to two directories **that never existed here**

**All of them passed review. Many times. One survived five rounds** — every reviewer read the shell and the TypeScript separately, and the defect lived exactly in between.

---

# Review and execution catch different things

| | Catches | Misses |
|---|---|---|
| **Review** | wrong logic, bad design, unclear naming | a control examining something absent |
| **Execution** | a control that cannot fail | intent, taste, architecture |

<br>

**They complement each other. They don't replace each other.** If you ask review to enforce compliance, you ask it to do the one thing it structurally cannot do.

<span class="small">This is not a story about weak reviewers. A reviewer sees a well-formed assertion. Only running it tells you whether it can fail at all.</span>

---

# I had written this down myself

Line 215 of my own pitch deck. Written in good faith. Presented to real people:

> "Everything below is **enforced by tooling**, not memos.
> The rules live in code (hooks, scripts, gates) — not in slides."

**The claim itself was a memo.**

<span class="small">If this can happen in a deck whose whole subject is enforcement, please assume it is happening in yours too.</span>

---

<!-- _class: lead -->

# Part 2

## Several engineers. Several agents.

---

# The fleet is already mixed

On this project, the work is done by personas backed by five agents on five different plans. A roster in the repository coordinates them:

| Backing agent | Plan |
|---|---|
| Claude Code | Max |
| ChatGPT / Codex | Pro |
| Kimi | Pro |
| Qwen (`qwen3-coder`) | local, on my own machine |
| Gemini | free |

Nothing exotic here — most teams are already there: **different engineers, different subscriptions, different agents, one codebase.**

<span class="small">The plan column is not trivia: a free tier runs out in the middle of a review, a paid one hits its five-hour window in the middle of a task, and a local model is unmetered but only good for simple work. <strong>The fleet changes during the working day</strong> — all three happened to me while I was preparing this talk.</span>

**So let me ask the question that decides everything about a guardrail:** *which of them does it actually bind?*

---

# The layer decides the reach

Same 338 live rules, one different question — with the baseline next to today.

| Enforced by (`ENFORCED`) | Binds | Baseline | Today |
|---|---|---:|---:|
| nothing — prose only | nobody | **204** | **189** |
| a hook in one agent's tool | that tool | **16** | **18** |
| repository script | whoever invokes it | **23** | **23** |
| repository test | every run of the suite | **41** | **51** |
| local git control | everyone, *if* hooks are armed | **42** | **42** |
| CI-backed control | every pushed change | **12** | **15** |

<span class="small">Counts use <code>ENFORCED</code>, not the stale <code>BINDS</code> field: four newly mechanised rows still say <code>UNANCHORED</code>. Six live rows are marked <code>STALE</code>; this is an audit trajectory, not a claim that every row has passed a fresh consistency review.</span>

---

# The anecdote that proves it

We have a rule: "no chained shell commands". A hook in one agent's tool enforces it. It was one of the few rules everybody believed was enforced.

Then the **Codex** auditor reported:

> "It does not govern Codex `exec_command` calls directly.
> **I complied by splitting commands** — but this tool surface
> is outside that hook."

**An agent followed the rule by discipline — in the very session auditing whether our rules depend on discipline.**

---

# So there is only one place for a guardrail

Per-engineer setup drifts, silently and privately.
A hook in one agent's tool binds that tool.
Documentation binds nobody.

<br>

> The **repository** is the only place every engineer
> and every agent has to go through.

**Git hooks and CI are the only two layers that bind all of them.** Multi-agent work does not simply benefit from a shared blueprint — **it has no other place to put a rule.**

---

<!-- _class: lead -->

# Part 3

## Making a mixed fleet work

---

# One log. Every agent. `tail -F`

Every agent — no matter which provider backs it — writes to one feed, tagged with persona and backing agent.

```
tail -F logs/agent-activity.log
```

- You watch the work **while it happens**, not in a summary written by the one who did it
- You see a stalled or looping agent within seconds
- You get attribution for free: which persona, which provider, which action

**The cheapest observability you will ever add — and it is on your own fleet.**

<span class="small"><code>-F</code>, not <code>-f</code> — it follows the file by name, so it survives rotation.</span>

---

# Alternate the provider on every pass

```
 Claude          Codex            Claude           Codex
  code    →   review + fix   →  review + fix  →  review + fix  →  converged
```

**It stands on two properties:**

1. **The provider rotates.** A model's blind spots correlate with itself — a second pass by the same model reads with the same priors.
2. **Every pass must _fix_, not only report.** An agent that has to make the change cannot hide behind a vague finding.

It is the four-eyes principle, with eyes that really are different.

---

<!-- _class: lead -->

# Part 4

## What goes into one

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

**If a rule cannot refuse anything, it is documentation. Call it that.**

---

# A lifecycle the work moves through

```
backlog/  →  doing/  →  waiting-acceptance/  →  done/
         promote     lands on main        owner accepts
```

Four states, three of them gated by the owner. **The folder is the status field** — there is no separate tracker that can get out of sync with the tree.

Nothing reaches `done/` because an agent decided it was finished.

---

# An export boundary

A blueprint holds two kinds of code, with opposite rules:

- **Internal machinery** — bootstrapping, sync, the export logic itself. **No derived project ever runs it.**
- **Scaffolding** — tests, config and controls that **travel** to every project.

When you mix them up, project-specific logic ends up in generic files.

**Make the boundary a mechanism, not a decision you take file by file.**

---

# A sync model with a direction

Capabilities flow **down** to every project. Improvements flow **up** as *requests*.

> A back-propagation is a **request**, not a delivery.

The upstream command pushes a branch and opens a pull request. It writes into no working tree. **It lands nothing.**

Somebody with the whole blueprint in front of them decides whether one project's lesson is really generic.

---

# Derived, not designed

1. A project hits a real requirement — an incident, a customer ask, a bug nothing existing could have caught
2. The team builds the fix and captures the pattern
3. Once the pattern survives production, the generic core travels up
4. The next project inherits it as a **default**

<br>

**Don't write rules for problems you did not have yet.** You will encode guesses, and guesses are what rots.

---

<!-- _class: lead -->

# Part 5

## Six traps

**Each of them cost me real time. None of them needs to cost you any.**

---

# Trap 1 · Controls in a language you don't read

Our gate and its ~45 suites were written in shell. Shell is not my stack.

So I stopped reading the controls. I started reviewing **outcomes** (`PASSED`) instead of **mechanisms**.

<div class="trap">
<strong>Every defect on the Part 1 slides lived in code I had stopped reading.</strong>
</div>

**Do this instead:** write your controls in your team's primary language. Not for elegance — *you cannot own a control you cannot read.*

---

# Trap 2 · Sync without a direction

Our upstream command used to copy files directly into the blueprint's tree. This means **every derived project could write into the shared blueprint.**

One project's paths and config went out to every other project on their next pull. Traceably, twice.

<div class="trap">
My own deck sold this as a feature: <strong>"The flow is bidirectional."</strong>
</div>

**Do this instead:** bidirectional was never the goal — **curated** was. Requests go up, capabilities come down, and a human sits in between.

---

# Trap 3 · Agents without a reader

For a while I could not work on the blueprint or its derived projects, so I let the agents run mostly unattended. They did not stop working. They overcomplicated things, and they developed their own language.

<div class="trap">
Reading the bug reports of my own project <strong>made me doubt my English.</strong>
</div>

Nothing was factually wrong. Every artefact was well-formed. **But the project had become foreign to the person accountable for it — me.**

**Do this instead:** treat comprehensibility as load-bearing. An artefact its owner cannot read will not be reviewed.

---

# Trap 4 · Lists you maintain by hand

A control that checks *"everything in this list"* is blind to everything that is not in the list. Three different incidents:

- A test manifest that matched `*.sh` — so it could not see the TypeScript suites it was built to govern
- A hand-kept list of what ships — `package-lock.json` travelled to every project without the four files it needs, and their CI died on the first push with `ENOENT … package.json`
- A suite catalogue that ships while the suites it lists do not — every project inherited rows asking for files that could not exist there

**Do this instead:** derive the set from the filesystem. Then forgetting to list something is simply not possible.

---

# Trap 5 · Budgets that quietly decide coverage

We had a 30-second ceiling on the pre-push gate. **And it started to make coverage decisions.**

A suite guarding the exact door two incidents came through grew from 2.3 s to 6.0 s. The cheapest way to meet the budget was to move it out of the gate. The gate still said *all checks passed* — it just checked less.

**Do this instead:** decide coverage on risk, never on the clock. When a suite is slow, fix the suite. One went from **125 s → 37 s** with every assertion intact — as soon as someone asked *why* instead of *where to put it*.

---

# Trap 6 · Assertions never proven to fail

This is the trap behind all the others.

**A test you have never seen go red is a hypothesis, not a control.**

<br>

**Do this instead:** mutate the mechanism, watch the test fail, and write it down. Every assertion, once.

> If you adopt only one thing from this talk, please adopt this one.
> It is cheap, and it is the only defence against the whole Part 1 category.

---

<!-- _class: lead -->

# Part 6

## Audit your own

---

# The method, transferable

You can run this on your own projects this week, without any new tooling.

1. **Enumerate** every normative line in your standards docs. Count them.
2. For each one: **name the mechanism** — `file:line` — or write `NONE`.
3. For each mechanism: **make it fail.** If you can't, it is not a control.
4. Write down **who and what it binds** — a hook in one agent's tool, a git hook, or CI.
5. Sort into: *mechanise* / *already fine* / *keep but stop claiming enforcement* / *delete as aspiration*.

**Use two providers and let them converge.** Where they disagree, your truth is the least certain.

---

# What the audit told me to do

Each of the 373 audited rows has a verdict:

| Disposition | Audit | Today | |
|---|---:|---:|---|
| **Mechanise** | 47 | **30** | worth a real control, still owed |
| **Already fine** | 125 | **141** | a mechanism exists and was proven to fire |
| **Keep, stop claiming** | 166 | **167** | real rule, honestly unenforceable |
| **Delete, or aspiration** | 35 | 35 | removed, or describes a project this is not |

<br>

**202 rules get downgraded or deleted.** This is the deliverable, not a concession — a small, honest protocol beats a large, decorative one.

<span class="small">The middle column is the audit as accepted on 2026-09-17; the right is today. Only <strong>Mechanise</strong> is a queue — it shrinks as controls land, and it is the one number an outsider can hold me to.</span>

---

# My scoreboard, so yours has a reference

<div class="stat">134 → 149 / 338</div>

**live rules with a named mechanism** — accepted audit → today.

<br>

You can follow the development in the CSV history:

**134 → 138 → 141 → 143 → 147 → 148 → 149**

Still low — but now it is a ratchet, not a feeling. The epic's net movement so far is **+15**.

> **Knowing the number makes the whole difference.**
> You cannot ratchet a number you have never measured.

<span class="small">Denominator: 338 live rows; 35 <code>DELETED</code>/<code>DELETE-AS-ASPIRATION</code> rows are excluded. “Named mechanism” is the CSV's <code>ENFORCED != NONE</code>; reach is shown separately because those are different claims.</span>

---

<!-- _class: lead -->

# Part 7

## Write your own

---

# Why yours, and not mine

A blueprint encodes **your** architecture, **your** Definition of Done, **your** security posture, **your** incidents.

And it has to be **derived** — grown from requirements you really hit. If you adopt someone else's blueprint wholesale, you get controls for problems you never had, and none for the ones you have.

<br>

It is Trap 1 again, one level higher:

> **A blueprint you did not build is documentation.**
> You will not read it, and you will not own it.

---

# Blueprint what your projects share

Don't start with a grand standard. Start where you are about to solve the same problem for the second time.

- **A technology you are standardising on** — adopting Kafka? Blueprint the **outbox pattern**, consumer idempotency, DLQ handling, schema evolution
- **Test harnesses** — fixtures, isolation, determinism
- **UI libraries and kits** — components, tokens, accessibility defaults
- **Agentic coding standards** — the guardrails themselves. **Especially this one.**

**Each of them is a place where the second project should not re-learn the lessons of the first one.**

---

# One blueprint does not scale

I have **one**. It works because these are my projects, and they follow my standards.

**At organisation scale, one blueprint becomes a monolith — and then a monster.** Every team's exception has to live in it, it grows beyond what anyone can hold in their head, and the controls that matter get buried under the ones that don't.

**You want several of them: specialised, composable, and owned separately.**

- one per **archetype** — event-driven, backend-for-frontend, back-office
- one per **adopted technology** — Kafka, your cloud, your UI kit
- one for **agentic-coding standards**, which every project pulls

<span class="small">My own numbers show it: 338 live rules, 189 still prose-only — a single blueprint already struggling at pet-project scale.</span>

---

# Summing up

1. **Your projects are not singletons.** A handful of shapes covers most of them — and this shared part is what you encode.
2. **Review is a complement, not a control.** It cannot see a check that examines nothing.
3. **The layer decides the reach.** A hook in one agent's tool, a git hook, or CI — only the last two bind everybody.
4. **Rotate the provider, and let every pass fix instead of report.** Where two providers disagree, your code is misleading.
5. **Measure what is enforced.** The number will be lower than you expect — and having it makes the whole difference.

You cannot order guardrails like a pizza. You have to build them, one incident at a time — but it is worth it!

---

<!-- _class: lead -->

# The one sentence

## An agent follows the rules you enforce,
## not the rules you write.

**Put them in the repository, let them refuse things,
and let your incidents grow them.**

---

<!-- _class: lead -->

# Thank you

**Luiz Scheidegger**
luiz@struct2flow.com

<span class="small">Every enforcement number here comes from the tracked CSV history:<br><code>git log -- docs/done/TASK-022-anchor-rules/TASK-022-rule-enforcement.csv</code></span>
