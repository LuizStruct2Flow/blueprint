# struct2flow Stack Defaults

When a project doesn't say otherwise, this is the stack. Each project's
own `project_config_overview.md` + `project_config_paths.md` may
override per surface — but state **why** in one sentence so it's a
deliberate decision, not drift.

## Backend

- **Language / runtime:** Node.js / TypeScript.
- **Compute:** AWS Lambda (serverless-first). Reach for ECS / Fargate
  only when Lambda's 15-min ceiling, cold-start, or package-size limits
  bite.

## Frontend

- **Language:** TypeScript.
- **Framework:** React or Next.js — project's choice, document in
  `project_config_overview.md`.
- **Hosting:** AWS Amplify Hosting.

## Data

- **Default:** DynamoDB (key-value / single-table design).
- **Alternative:** MongoDB — pick when the access pattern needs
  ad-hoc query + flexible secondary indexes that DynamoDB can't model
  cleanly.
- **Avoid by default:** RDS / Aurora unless the workload is genuinely
  relational and the SQL semantics are load-bearing.

## Infrastructure

- **IaC:** AWS CDK (TypeScript).
- **Cloud:** AWS.
- **Posture:** serverless-first — Lambda + DynamoDB + API Gateway +
  Amplify Hosting + EventBridge before anything that runs 24/7.

## CI / Remote repo

- **Remote git:** AWS (CodeCommit). GitHub is the fallback when a
  project needs public visibility or external contributors.
- **Pipelines:** AWS CodePipeline + CodeBuild when the repo is on
  CodeCommit; GitHub Actions when the repo is on GitHub.

## When to override

Override is normal. The default exists so that "new project, no
constraints, pick a stack" lands the same place every time and the
founder doesn't re-decide. If a project's customer, integration
target, or workload type makes a different choice obviously better
(e.g. a Python ML project; a deeply-relational app; an existing
codebase to extend), override it and write a single-sentence rationale
in the project's `project_config_overview.md` tech-stack block.
