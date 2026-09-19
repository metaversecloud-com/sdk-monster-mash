# tofu/

AWS resources this app owns, applied by **Terrakube** (workspace
`sdk-monster-mash`, folder `tofu`, OpenTofu 1.11.5).

Infrastructure for an SDK app used to live in `infra-terraform` — the bucket in
whichever workspace happened to own it, the IAM in another, the grants to the
other accounts in a third. Now that the app itself is GitOps-deployed, its
infrastructure sits next to its code and moves in the same PR.

## What it creates

| Where | What |
| --- | --- |
| topia-sdk-prod `471112828260` | S3 bucket `sdk-monster-mash` (public read, CORS, SSE-S3, ACLs off) and its bucket policy |
| topia-sdk-prod `471112828260` | `sdk-monster-mash-task-bucket` policy → `topia-prod-mmash0-task` |
| stride-sdk-prod `637423291416` | `sdk-monster-mash-task-bucket` policy → `stride-prod-mmash0-task` |
| schoolspace-prod `637423330669` | `sdk-monster-mash-task-bucket` policy → `sspace-prod-mmash0-task` |
| dev / infra-sandbox `368076259134` | IRSA role `sdk-apps-dev-monstermash0-irsa` for `sdk-apps-dev:monstermash0-sa` |

The bucket lives in **one** account; every other account reaches it
cross-account, which needs a grant on both sides — an identity policy on the
principal *and* a statement in the bucket policy. Inside topia-sdk-prod the
identity policy alone is enough, so the bucket policy only names the foreign
principals.

## How four accounts work from one workspace

Terrakube issues one web-identity JWT per job with subject
`organization:topia-mgmt:workspace:sdk-monster-mash`. Every account already has
a `terrakube-role` trusting `organization:topia-mgmt:workspace:*`, so the same
token assumes the role in each account directly — `providers.tf` declares one
aliased provider per account and only overrides `role_arn`. No role chaining, no
extra trust policies, no static keys.

Provider aliases cannot be generated from a map: adding an account means adding
a provider block *and* the resources that use it, not just an entry in
`var.accounts`.

## Wiring the app to the bucket

`server/routes.ts` reads `S3_BUCKET`. Set it:

- **dev** — `argo/overlays/dev/monstermash0-config.yaml`, plus the
  `monstermash0-sa` ServiceAccount annotated with the `dev_irsa_role_arn`
  output. Without the annotation the pod falls back to the node role and every
  call is AccessDenied.
- **prod** — the `secrets` map for the `mmash` service in each account's
  `ecs_services` input (infra-terraform).

## Running it

Actions → **Tofu (plan / apply / destroy)** → pick `plan`, `apply` or
`destroy`. The workflow calls the Terrakube API and waits; it never runs tofu on
the runner.

Requires:

| Kind | Name | Notes |
| --- | --- | --- |
| Secret | `TERRAKUBE_TOKEN` | Terrakube token. Org-level secret in metaversecloud-com, same as `PAT` and `AWS_ROLE_ARN` which this repo's other workflows already read. |
| Variable | `TERRAKUBE_WORKSPACE_ID` | Optional — resolved by name when unset. |

Nothing to set on the workspace itself. The AWS credential ENV wiring comes
from the shared `aws-dynamic-credentials` collection (infra-terrkube
`03-terrakube/collections.tf`); the workspace opts in with
`"aws_dynamic_credentials": true` in `TERRAKUBE_WORKSPACES_VCS`.

## Adding this to another app

Copy `tofu/`, `scripts/terrakube.sh` and `.github/workflows/tofu.yml` from
`sdk-ai-boilerplate`, then change the defaults in `variables.tf`: `app_name`,
`bucket_name`, `ecs_service_name` and `eks_dev.service_account`. Also update the
workspace name in `backend.tf` and `TK_WORKSPACE_NAME` in the workflow, and add
the workspace to `TERRAKUBE_WORKSPACES_VCS` in Doppler.
