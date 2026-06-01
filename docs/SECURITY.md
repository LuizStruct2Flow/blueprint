# Security — keep secrets out, find vulns fast, fix before deploy

The principle lives in [CLAUDE.md](../CLAUDE.md) §"Security is a main
concern" and the DoD checklist in [DoD.md](DoD.md) §6.2. Both are
runtime-agnostic. This file holds the **recipes** — concrete patterns per
runtime so projects don't reinvent the wheel.

Pick one when you fill in `project_config_overview.md` §"Security stack".
Combinations are fine (e.g. an AWS-hosted backend that also ships a
desktop companion app).

> **Why these four capabilities aren't optional.** Quality of working
> software degrades to zero the moment something is exploited in
> production. The recipes below all deliver the same four capabilities;
> they just differ in tooling and where the gate fires:
> keep secrets out of git → catch OWASP patterns before push →
> watch dependencies + infra for CVEs continuously → fix-before-deploy
> for everything that touches a customer surface.

---

## Recipe A — AWS-hosted / serverless (default for hosted projects)

The struct2flow default per [STACK_DEFAULTS.md](../STACK_DEFAULTS.md):
Lambda + DynamoDB + Amplify Hosting + CDK + CodePipeline.

### 1. Keep secrets out — `gitleaks` in the pre-push hook

`.githooks/pre-push` runs `gitleaks protect --staged` before any push.
Blocks on detection. Catches AWS keys, OpenAI tokens, JWT secrets,
arbitrary high-entropy strings, etc.

For accidental commits that already happened: `gitleaks detect` over
the full history, then rewrite with `git filter-repo` and rotate the
leaked credential immediately. **The credential is compromised the
moment it lands on `origin`** — assume it's been scraped within
minutes.

Secrets at runtime live in AWS Secrets Manager / Parameter Store,
fetched at Lambda cold-start. Never in `.env` files committed to the
repo, never in CDK string literals.

### 2. SAST — Semgrep + ESLint security plugins

**Semgrep** runs in pre-push with `--config=auto` (mostly community
OWASP rules + struct2flow-specific patterns). Typical PR cost: 5-10s.
Blocks on any finding ≥ `WARNING` severity unless suppressed inline
with a justification comment.

**ESLint** carries `eslint-plugin-security` +
`eslint-plugin-no-unsanitized` in the workspace's eslint config.
Already part of the lint gate (§4.2 in DoD), so cost is zero
incremental.

CI runs the deeper Semgrep pack
(`--config=p/owasp-top-ten --config=p/r2c-security-audit`) — slower,
not pre-push budget.

### 3. SCA — `osv-scanner` for dependency CVEs

Pre-push: `osv-scanner --lockfile=backend/package-lock.json --lockfile=frontend/package-lock.json`.
Fails on any CVE rated **High** or **Critical**. Below that → tracked
in `docs/config/findings.md` as a planned upgrade.

CI nightly: same scan across the full repo; if a *new* CVE just
dropped in something we already use, it fires an alert (same SNS →
Slack pipe as MALT).

### 4. IaC scan — `trivy config` over the CDK output

CI step before any deploy: `cdk synth` then `trivy config cdk.out/`.
Catches public S3 buckets, missing SSE, over-permissive IAM
statements, security-group `0.0.0.0/0` ingress, unencrypted RDS, etc.

Severity policy: **High** or **Critical** → blocks the deploy.
**Medium** → allowed but recorded in `findings.md` for cleanup.

### 5. DAST — OWASP ZAP baseline against the preview environment

CI pipeline (CodePipeline): after the preview env is healthy, run
ZAP baseline scan against the API Gateway URL. Passive only, ~5 min.
Findings annotate the build but only **High** or **Critical** block
promotion to prod.

Nightly: full active scan against the prod URL (read-paths only —
nothing that mutates state). Results land in S3, summarized in the
same Slack channel as MALT alerts.

### 6. Threat model — `project_config_security.md`

Each project carries a `project_config_security.md` (sibling to
`project_config_dod.md`) listing:

- **Trust boundaries** — what's the public surface, what's
  intra-VPC, what's per-tenant.
- **Auth surfaces** — Cognito / Auth0 / custom; token lifetime;
  refresh policy.
- **Sensitive data classes** — PII, payment, credentials; storage
  + transport + retention rules per class.
- **Adversary assumptions** — what we defend against, what we
  don't (out-of-scope by design).
- **Incident playbook** — first 10 minutes, escalation, comms.

The threat model is reviewed at every **major** feature plan —
same gate as the §2 major bug consensus.

---

## Recipe B — Local app / desktop / CLI (no cloud)

Apps with no deployed HTTP surface (Electron / Tauri desktop, CLIs,
local-first utilities).

### 1. Keep secrets out

Same `gitleaks` pre-push hook as Recipe A. Plus: any local config the
app writes (token cache, keystore) must live under the OS keychain
or an OS-protected user dir (`~/Library/Keychains` on macOS,
Credential Manager on Windows, `libsecret` on Linux). Never plain
JSON on disk.

### 2. SAST — Semgrep + ESLint security plugins

Same as Recipe A.

### 3. SCA — `osv-scanner` over lockfiles

Same as Recipe A. Critical for desktop apps because users install the
shipped artifact directly — a vulnerable dependency travels into every
install.

### 4. Signed releases — supply-chain integrity

Distribution artifacts (DMG / MSI / AppImage / npm tarball) are
signed and the public key + SHAs are published with the release.
For Electron / Tauri: codesign on macOS, signtool on Windows. For
CLIs distributed via npm: enable `npm provenance`.

### 5. No DAST (no remote surface)

Skip ZAP / Nuclei. There's nothing remote to scan. The threat model
shifts to: malicious update server, compromised lockfile, local
privilege escalation. Cover via §1 + §3 + §4.

### 6. Threat model — same `project_config_security.md`

Adapted for desktop:

- **Trust boundaries** — user filesystem, OS keychain, update server.
- **Auth surfaces** — none, or device-bound tokens.
- **Sensitive data classes** — what the app stores locally, encrypted
  at rest (`age` / `libsodium`).
- **Update channel** — signed, fetched over HTTPS, public key pinned.
- **Adversary assumptions** — same machine, malicious dependencies,
  spoofed update server.

---

## Recipe C — Containerized service (Docker / ECS / Kubernetes)

For services packaged as containers (struct2flow's fallback when
Lambda's 15-min ceiling or package size bite).

### 1. Keep secrets out

Same `gitleaks` pre-push. At runtime, secrets come from the
orchestrator's secret store (ECS task definition `secrets`,
Kubernetes `Secret`, etc.). Never in the image, never in env-vars
baked into the Dockerfile.

### 2. SAST — same as Recipe A

### 3. SCA — `osv-scanner` over lockfiles, same as A

### 4. Container image scan — `trivy image`

CI step right after `docker build`:
`trivy image --severity HIGH,CRITICAL --exit-code 1 <image>:<tag>`.
Blocks the push to ECR / GHCR on any High/Critical CVE in the
**base image or any layer**. Forces base-image refresh discipline.

### 5. IaC scan — `trivy config` over Kubernetes manifests / Terraform / CDK

Catches the same drift class as Recipe A.4 in the orchestrator's
own config language.

### 6. DAST — OWASP ZAP against the service's HTTP surface

Same shape as Recipe A.5. If the service is internal-only (no public
ingress), skip the prod scan but keep the preview-env baseline scan.

### 7. Threat model — `project_config_security.md`

Container-specific additions:

- **Image provenance** — base image source, signed?
- **Runtime sandboxing** — read-only root FS, dropped capabilities,
  no privileged mode, seccomp profile.
- **Network egress** — does the container need outbound internet?
  If not, deny by default at the orchestrator level.

---

## Cross-recipe rules (apply to all three)

These bind every project regardless of stack.

### Pre-push gate — what runs locally

Per the blueprint pre-push hook (DoD §4 enriched in §4.7):

1. `gitleaks protect --staged` — fails on any secret
2. `semgrep --config=auto` — fails on `WARNING+` severity
3. `osv-scanner --lockfile=…` — fails on `HIGH+` CVE
4. (lint security plugins ride inside `npm run lint` — already wired)

Budget: all four must fit inside the §3.7 pre-push ≤30 s ceiling.
If they don't, move the offender to CI (Semgrep deep packs are the
usual offender, not gitleaks).

### CI / pipeline gate — what runs after push

| Step | Tool | Blocks on | Where the finding lives |
|---|---|---|---|
| Deep SAST | `semgrep --config=p/owasp-top-ten --config=p/r2c-security-audit` | Any HIGH | PR comment + `findings.md` |
| Container scan | `trivy image` (Recipe C only) | HIGH+ CVE | Blocks ECR push |
| IaC scan | `trivy config` | HIGH+ misconfig | Blocks deploy |
| DAST baseline | `zap-baseline.py` | HIGH+ alert | Blocks promote to prod |

### Nightly scans

- `osv-scanner` over all lockfiles — catches *new* CVEs in deps we
  already use. Alert routes through the same MALT pipe.
- ZAP full active scan against prod (read-paths only).
- Nuclei against deployed targets — template-based, complementary
  to ZAP.

### Findings register

`docs/config/findings.md` is the canonical place where every
security finding lives until fixed or accepted. Same register as
Codex review findings — security findings carry a `[SEC]` tag.
A finding marked **Status: Accepted** has a sign-off line naming
who accepted the risk and why.

### Incident response

When a security finding hits production:

1. **Stop the bleed** — disable the affected route / rotate the
   leaked secret / pin the vulnerable dep at a known-good version.
   Speed beats elegance here.
2. **Write the bug** — `BUG-XXX` in `docs/doing/BUGS.md` with the
   `[SEC]` tag. Two-commit pattern still applies: reproducer first,
   fix second.
3. **Notify per project policy** — if PII / payment / credentials
   were exposed, the `project_config_security.md` §"Incident
   playbook" names who gets paged and the regulatory clock.
4. **Postmortem** — `docs/done/INCIDENT-YYYY-MM-DD.md` with timeline,
   root cause, what the gate missed, what changes (new rule? new
   scanner? new pre-push step?). The DoD evolves from real incidents,
   not hypotheticals.

---

## What you don't ship

- Hard-coded secrets, even "just for local dev" — that file will be
  committed eventually.
- `// eslint-disable-next-line` or `# nosec` / `// nosemgrep` without
  a justification comment naming the threat model entry that makes
  the suppression safe.
- A new public route without a corresponding ZAP baseline run.
- A dep upgrade that introduces a new HIGH+ CVE without an immediate
  rollback or pin.
- A `findings.md` entry left untriaged across two consecutive
  grooming passes — either fix, defer with a date, or mark
  `Status: Accepted` with a sign-off.
