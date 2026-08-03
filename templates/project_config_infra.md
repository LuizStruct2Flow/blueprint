# Project Infrastructure Config — {{PROJECT_NAME}}

Project-specific IaC configuration: environments, ownership, drift
cadence, cost ceilings, state backends, rollback procedure. The generic
IaC rules (four capabilities, recipes per stack) live in
[docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md). This file is what
makes them concrete for {{PROJECT_NAME}}.

Read alongside [`project_config_dod.md`](project_config_dod.md) (pre-push
gate, coverage mode, doc-sync list) and
[`project_config_security.md`](project_config_security.md) (threat
model). All three define the project's runtime DoD.

---

## Stack recipe (DoD §6.3)

> Pick exactly one — these are the three recipes in
> `docs/INFRASTRUCTURE.md`. Combinations are fine (e.g. an AWS-first
> backend with a small Kubernetes workload for batch jobs); declare each
> surface separately if so.

- **Recipe:** `{{A — AWS-first / CDK | B — multi-cloud / Terraform | C — Kubernetes-native / Helm+ArgoCD}}`
- **IaC root:** `infra/`
- **Tool versions** (pinned in `infra/package.json` or `versions.tf`):
  - CDK: `{{2.x.y}}`
  - TypeScript: `{{5.x.y}}`
  - Node: `{{20.x}}`
- **Pinned via:** `package-lock.json` + `.nvmrc`

---

## Environments

> Every env the project deploys to. New env = one row + a pipeline
> run, never a hand-crafted sandbox.

| Env | Account / Cluster | Region | Deploy trigger | Approvers | Sizing | Notes |
|---|---|---|---|---|---|---|
| dev | `111111111111` | eu-central-1 | merge to `main` | (auto) | small | feature-flag on |
| staging | `222222222222` | eu-central-1 | merge to `main`, post dev smoke | (auto) | small | mirrors prod data shape |
| prod | `333333333333` | eu-central-1 | manual approval | founder | prod | autoscaling on |
| | | | | | | |

**Ephemeral envs** (per-PR / per-feature):
- **Triggered by:** `{{PR label `ephemeral`}} | not supported`
- **Lifetime:** `{{auto-destroyed 24h after PR close}}`
- **Subset of stacks:** `{{api + data, no observability stack}}`

---

## Stack ownership

> Which logical stacks exist and who owns each. Ownership = who reviews
> PRs touching it + who's on call when its alarms fire.

| Stack name | Resources | Owner | Drift cadence | Notes |
|---|---|---|---|---|
| `{{PROJECT_NAME}}-api` | API GW, Lambdas, DynamoDB | founder | nightly | core path |
| `{{PROJECT_NAME}}-frontend` | Amplify app, Route53 | founder | nightly | |
| `{{PROJECT_NAME}}-observability` | CloudWatch dashboards, alarms, SNS | founder | weekly | |
| `{{PROJECT_NAME}}-shared` | KMS keys, Secrets Manager parents | founder | nightly | |
| | | | | |

---

## State backends

> Where IaC state lives. Bootstrap steps for a fresh account.

### Recipe A — CDK

State is in CloudFormation per stack — nothing to bootstrap beyond
`cdk bootstrap` per account/region:

```bash
cdk bootstrap aws://111111111111/eu-central-1  # dev
cdk bootstrap aws://222222222222/eu-central-1  # staging
cdk bootstrap aws://333333333333/eu-central-1  # prod
```

This creates the CDK toolkit stack (assets bucket, deploy role, etc.)
in each account. Tracked in §"Bootstrap resources" below.

### Recipe B — Terraform

```hcl
terraform {
  backend "s3" {
    bucket         = "{{PROJECT_NAME}}-tfstate-{{env}}"
    key            = "{{stack}}/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "{{PROJECT_NAME}}-tflock"
  }
}
```

Bootstrap once per account:
```bash
aws s3api create-bucket --bucket {{PROJECT_NAME}}-tfstate-dev --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1
aws s3api put-bucket-versioning --bucket {{PROJECT_NAME}}-tfstate-dev \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket {{PROJECT_NAME}}-tfstate-dev \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws dynamodb create-table --table-name {{PROJECT_NAME}}-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
```

### Recipe C — ArgoCD / Flux

Cluster state lives in git (this repo or a sibling). Bootstrap once
per cluster:

```bash
kubectl apply -f infra/argocd/bootstrap/    # installs ArgoCD itself
kubectl apply -f infra/argocd/applications/ # registers Apps to track
```

ArgoCD is then self-managing — it watches its own `Application`
manifests.

---

## Bootstrap resources

> Resources that exist *before* the IaC tree can run. These are the
> one-time-per-account exception to the "everything in code" rule.

| Resource | Account(s) | Created by | Why exempt |
|---|---|---|---|
| CDK toolkit stack (`CDKToolkit`) | dev, staging, prod | `cdk bootstrap` | required by CDK itself |
| Terraform state bucket | dev, staging, prod | one-time CLI | chicken-and-egg with the backend |
| Terraform lock table | dev, staging, prod | one-time CLI | same |
| OIDC provider for GitHub Actions | dev, staging, prod | one-time CLI | required to grant CI roles |
| | | | |

---

## Cost ceilings

> When a PR adds resources whose **monthly cost delta exceeds the
> threshold below**, the PR body calls it out and the founder
> approves explicitly before merge.

| Env | Soft threshold (Infracost diff) | Hard ceiling (CloudWatch budget alarm) |
|---|---|---|
| dev | $20 / month | $100 / month |
| staging | $20 / month | $100 / month |
| prod | $50 / month | `{{$500 / month}}` |

Budget alarms are declared in CDK / Terraform and fire to the same
SNS / Slack pipe as MALT.

---

## Drift detection

> Nightly job runs `cdk diff` / `terraform plan` / ArgoCD `OutOfSync`
> watch per env. Out-of-band changes alert through the MALT pipe.

| Env | Schedule | Alert channel | Auto-revert? |
|---|---|---|---|
| dev | nightly 03:00 UTC | `#infra-drift` Slack | no — investigated next morning |
| staging | nightly 03:15 UTC | `#infra-drift` Slack | no |
| prod | nightly 03:30 UTC | `#infra-incidents` Slack + page | no — manual decision (codify or revert) |

A drift alert open **>24h** is a `[INFRA]` finding in
`docs/config/findings.md`.

---

## Suppressions register

> Every `// cdk-nag-suppress`, `# tfsec:ignore`, or equivalent
> security/cost suppression in the IaC code is logged here with the
> justification. Reviewed at every grooming pass.

| File:line | Rule suppressed | Why it's safe / accepted | Reviewer | Date |
|---|---|---|---|---|
| | | | | |

---

## Rollback procedure

> Per-stack rollback steps. Stateful resources name the
> data-migration reversal step explicitly.

### Stateless stacks (`{{PROJECT_NAME}}-api`, `{{PROJECT_NAME}}-frontend`)

1. Identify last known-good SHA on `main` (pipeline-green against prod).
2. Re-trigger the pipeline for that SHA: `aws codepipeline start-pipeline-execution --name {{PROJECT_NAME}}-prod`.
3. CloudFormation rolls the stack to the previous template
   automatically; verify via the smoke test in `infra/test/smoke/`.

### Stateful stack (`{{PROJECT_NAME}}-data`)

1. **Read schema migrations first** — if the bad deploy ran a
   migration, the rollback runs the inverse migration. Migrations
   without an inverse are forbidden in this project; see
   `docs/RFC-migrations.md` if it exists.
2. Snapshot the table(s) before any rollback action:
   `aws dynamodb create-backup --table-name {{table}}-prod --backup-name pre-rollback-{{date}}`.
3. Roll forward to the last known-good SHA per the stateless flow
   above.
4. If the rollback truncates data, restore the affected items from the
   point-in-time backup. Founder approves explicitly.

---

## Promotion path

> How a change reaches prod. Recipe-specific.

### Recipe A — CodePipeline (default)

```
PR open → CodeBuild synth + cdk diff comment
PR merge → CodeBuild → dev deploy (auto)
                    → smoke → staging deploy (auto)
                    → smoke → manual approval → prod deploy
```

Manual approval token: founder issues via CodePipeline console **after
inspecting the staging smoke result**. No mobile approvals.

### Recipe B — Terraform pipeline

Same shape, GH Actions or CodePipeline. `terraform plan` in PR;
`terraform apply` in pipeline per env; manual gate before prod.

### Recipe C — GitOps (ArgoCD)

```
PR open → CI runs helm diff + posts comment
PR merge → ArgoCD dev app auto-syncs from new SHA
                    → smoke passes
                    → PR to promote staging branch
                    → ArgoCD staging app auto-syncs
                    → smoke passes
                    → manual reconcile of prod app (auto-sync OFF in prod)
```

---

## Failure modes seen on this project

> Project-specific IaC incidents that motivated a rule. Add a row
> whenever a miss bites — the DoD only improves if real misses are
> folded back in.

| Date | Failure | Rule it motivated |
|---|---|---|
| | | |
