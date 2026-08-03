# Project Security Config — {{PROJECT_NAME}}

Project-specific threat model + security thresholds. The generic security
rules (four capabilities, recipes per stack) live in [docs/SECURITY.md](docs/SECURITY.md).
This file is what makes them concrete for {{PROJECT_NAME}}.

Read alongside [`project_config_dod.md`](project_config_dod.md) (pre-push
gate, coverage mode, doc-sync list). Both files together define the
project's security DoD.

---

## Stack recipe (DoD §6.2)

> Pick exactly one — these are the three recipes in `docs/SECURITY.md`.
> Combinations are fine (e.g. an AWS backend + a desktop companion app);
> declare each surface separately if so.

- **Recipe:** `{{A — AWS / serverless | B — local app / desktop / CLI | C — containerized service}}` (delete the ones that don't apply)
- **Public surfaces** (URLs / ingress / artifacts the customer touches):
  ```
  {{e.g.
   - API Gateway: https://api.{{PROJECT_NAME}}.com — Recipe A
   - Web app: https://app.{{PROJECT_NAME}}.com — Recipe A (Amplify)
   - Desktop installer: signed DMG, autoupdate from updates.{{PROJECT_NAME}}.com — Recipe B
  }}
  ```

---

## Trust boundaries

> Where does trust transition? Each row = one boundary the threat model
> defends. Reviewed at every major feature plan.

| From | To | Authentication | Authorization | Encryption |
|---|---|---|---|---|
| Internet | API Gateway | {{Cognito JWT / API key / mTLS}} | {{tenant-scoped IAM / RLS / policy doc}} | TLS 1.2+ |
| Lambda | DynamoDB | IAM role (least-privilege) | Per-table + per-key conditions | SSE at rest |
| Lambda | external API ({{name}}) | {{API key from Secrets Manager}} | n/a (egress only) | TLS 1.2+ |
| | | | | |

---

## Auth surfaces

> One entry per distinct auth flow. Each carries its own threat profile.

- **Identity provider:** `{{Cognito | Auth0 | custom | none}}`
- **Token type:** `{{JWT (RS256) | opaque session cookie | device-bound | API key}}`
- **Token lifetime:** access `{{15min}}` / refresh `{{30d}}`
- **Refresh policy:** `{{sliding | absolute | one-time use w/ rotation}}`
- **Session invalidation path:** `{{logout endpoint clears refresh family + Cognito GlobalSignOut}}`
- **MFA:** `{{required for admin / optional for users / not applicable}}`

---

## Sensitive data classes

> Every class of data the project handles, classified by sensitivity.
> Each class declares its storage / transport / retention rules.

| Class | Examples | Storage | Transport | Retention | Encryption at rest |
|---|---|---|---|---|---|
| PII (high) | email, name, phone | DynamoDB | TLS 1.2+ | until account deletion + 30d | KMS CMK per tenant |
| PII (low) | display name, locale | DynamoDB | TLS 1.2+ | account lifetime | AWS-managed key |
| Credentials | API keys, OAuth tokens | Secrets Manager | TLS 1.2+ | until rotated | KMS CMK |
| Payment | card last-4, billing addr | {{Stripe-only — never stored here}} | n/a | n/a | n/a |
| Audit logs | API access traces | CloudWatch Logs (1y) | n/a | 1y → S3 Glacier 7y | SSE-S3 |

**Rules:**
- PII (high) never logs in plaintext — redact at the logger.
- Credentials never appear in `git`, in CloudWatch, or in error messages.
- Card data never touches our infrastructure — Stripe-hosted fields only.

---

## Adversary assumptions

> Who are we defending against, and what's explicitly out of scope.
> Knowing the boundary makes "good enough" definable.

**In scope:**
- Opportunistic credential stuffing (rate-limited login + MFA)
- OWASP top-10 web attacks (CSRF tokens, parameterized queries, output encoding)
- Stolen-laptop scenarios (full-disk encryption, signed-out idle timeout)
- Supply-chain CVEs in pinned deps (osv-scanner, nightly re-scan)
- Misconfigured IaC (trivy config gates the deploy)

**Out of scope (deliberate):**
- Nation-state targeted attacks
- Insider abuse with prod console access (we trust the 2-person team)
- Physical attack on AWS data centers
- Zero-days in AWS-managed services (we trust the provider)

If a project's risk model is fundamentally different (regulated industry,
larger team, high-value target), revisit this section before relying on
the defaults.

---

## Scan thresholds

> The numbers the pre-push hook and CI enforce. Tune per project if the
> defaults don't fit.

| Scan | Default block threshold | This project | Why differs |
|---|---|---|---|
| `gitleaks` | any finding | any finding | — |
| `semgrep` (pre-push) | `WARNING+` | `WARNING+` | — |
| `semgrep` (CI deep packs) | `HIGH+` | `HIGH+` | — |
| `osv-scanner` | `HIGH+` CVE | `HIGH+` CVE | — |
| `trivy config` | `HIGH+` | `HIGH+` | — |
| `trivy image` | `HIGH+` | `HIGH+` | — |
| ZAP baseline | `HIGH+` alert | `HIGH+` alert | — |

---

## Suppressions register

> Every `// nosemgrep`, `# nosec`, `// eslint-disable` in the codebase
> for a security rule is logged here with the threat-model entry that
> makes it safe. Reviewed at every grooming pass.

| File:line | Rule suppressed | Why it's safe (TM entry) | Reviewer | Date |
|---|---|---|---|---|
| | | | | |

A suppression without an entry here is a finding — Codex / Claude Code
flag it at review and roll it back.

---

## Incident playbook — first 10 minutes

> When a security finding hits production, what happens. Specific to
> {{PROJECT_NAME}}'s ops shape.

1. **Triage (≤2 min)** — confirm the finding is real, not a scanner
   false positive. If genuine, escalate to step 2.
2. **Stop the bleed (≤5 min)** — one of:
   - Rotate the leaked secret via Secrets Manager + redeploy
   - Disable the exposed route (`amplify env disable {{env}}` or
     CloudFront WAF rule)
   - Pin the vulnerable dep to a known-good version + redeploy
3. **Notify (≤10 min)** — Slack `#sec-incidents` and:
   - PII / credentials exposed → founder + DPO (if appointed) immediately
   - Payment data exposed → never happens (Stripe-hosted), but if it did,
     legal counsel + Stripe within 1h
   - Auth bypass / RCE → founder + every active user via email within 24h
4. **Regulatory clock** — `{{GDPR: 72h notification window for PII breach
   affecting EU residents | n/a if no EU data | other framework}}`.
5. **File the bug** — `BUG-XXX` in `docs/doing/BUGS.md` with `[SEC]` tag.
   Two-commit pattern applies: reproducer first, fix second.
6. **Postmortem** — `docs/done/INCIDENT-YYYY-MM-DD.md` within 48h:
   timeline, root cause, what the gate missed, what changes (new rule?
   new scanner? new pre-push step?). The DoD evolves from real incidents,
   not hypotheticals.

---

## Alert wiring

> Where do security alerts land? Same destination as MALT, or separate?

| Source | Channel | Severity ladder |
|---|---|---|
| `gitleaks` (CI on `main`) | `#sec-incidents` Slack | always pages |
| `semgrep` (CI deep packs) | `#sec-findings` Slack | digest at HIGH+, page at CRITICAL |
| `osv-scanner` (nightly) | `#sec-findings` Slack | digest at HIGH+ |
| ZAP baseline (CI) | `#sec-findings` Slack | digest at HIGH+ |
| ZAP active (nightly prod) | `#sec-incidents` Slack | page at HIGH+ |
| CloudWatch alarm — auth failures spike | `#sec-incidents` Slack + PagerDuty | page on threshold |

---

## Findings register pointer

`docs/config/findings.md` is the canonical place where every untriaged
security finding lives until fixed or accepted. Security findings carry
the `[SEC]` tag. A finding marked **Status: Accepted** has a sign-off
line naming who accepted the risk and which threat-model entry above
justifies it.

---

## Failure modes seen on this project

> Project-specific incidents that motivated a rule. Add a row whenever
> a miss bites — the DoD only improves if real misses are folded back in.

| Date | Failure | Rule it motivated |
|---|---|---|
| | | |
