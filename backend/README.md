# ActionBridge Dental backend

HTTP API for cases, estimates and scenarios. Handlers validate with `@actionbridge/contracts` and calculate only through `@actionbridge/benefits-engine`.

## Routes (Phase 3)

| Route | Lambda | Result |
|---|---|---|
| `GET /health` | health | Status and versions only |
| `POST /v1/cases` | cases | 201 `{caseId, caseRevision}`; missing values allowed as `null` (status `draft`) |
| `GET /v1/cases/{caseId}` | cases | Owner's case, or 404 |
| `PATCH /v1/cases/{caseId}` | cases | `{expectedRevision, changes}` → new revision; stale → 409 |
| `POST /v1/cases/{caseId}/estimates` | calculations | `{expectedRevision}` → 200 `estimated \| needs_information \| unsupported`; 409 stale; 422 contradictory |
| `POST /v1/cases/{caseId}/scenarios` | calculations | Same statuses; baseline plus up to two permitted lower-cost alternatives |

Errors always use the nested envelope `{ error: { code, message, retryable, requestId, issues? } }`. Every response has an `x-request-id` header.

## Layout

```
src/
  features/cases/        api/ application/ ports/ infrastructure/   (DynamoDB + in-memory adapters)
  features/estimates/    estimate route
  features/schedules/    scenario route
  features/health/
  functions/             Lambda entry points: health, cases, calculations
  shared/                http envelope/router, auth, config, logging
  local/server.ts        local HTTP server over the same routes
scripts/bundle.mjs       esbuild → .build/<function>/index.mjs
scripts/smoke.mjs        end-to-end checks against any running API
```

## Authentication

- **Deployed stages use `AUTH_MODE=jwt` with Cognito (D-10).** The HTTP API JWT authorizer checks the token's issuer and audience before any Lambda runs; the handler uses the `sub` claim as the owner. `/health` is the only unauthenticated route. Demo users are created by an admin (no public sign-up) and hold synthetic data only. Send `Authorization: Bearer <access token>`.
- **`AUTH_MODE=demo`** is used only by the local server and tests: each device sends a random `x-demo-user-id` (16–64 letters, digits or hyphens). This isolates sessions but is **not authentication**.

## Current deployment

| | |
|---|---|
| Stack / Region | `actionbridge-dental-dev`, Ohio `us-east-2`, account 195469705669 |
| API base URL | `https://ihcdqmzc6b.execute-api.us-east-2.amazonaws.com/dev` |
| Cognito user pool / mobile client ID | `us-east-2_in8mqQVUv` / `kcpgj90ruhsav9tin680padr4` (public, not secrets) |
| Managed login domain | `https://actionbridge-dental-dev-195469705669.auth.us-east-2.amazoncognito.com` |

Read live values any time with `aws cloudformation describe-stacks --stack-name actionbridge-dental-dev --profile actionbridge --query "Stacks[0].Outputs"`.

## Run locally (no AWS)

```bash
npm run dev:api                          # from repo root; http://localhost:3000, in-memory, demo auth
API_BASE_URL=http://localhost:3000 npm run smoke -w backend
```

A phone cannot reach `localhost` on your laptop. Use the laptop's LAN IP on a network without client isolation.

## Sign in to AWS (laptop)

The CLI profile `actionbridge` uses `aws login` (your AWS console sign-in, temporary credentials). When it expires:

```bash
aws login --profile actionbridge --region us-east-2
aws sts get-caller-identity --profile actionbridge
```

## Deploy

From the repository root (Git Bash; in PowerShell call `sam` the same way):

```bash
npm run build:lambda
sam validate --lint --template-file infra/template.yaml --region us-east-2
# 1. Create a change set and review it (nothing is deployed yet)
sam deploy --template-file infra/template.yaml --stack-name actionbridge-dental-dev \
  --parameter-overrides AppEnv=dev --capabilities CAPABILITY_IAM --resolve-s3 \
  --region us-east-2 --profile actionbridge --no-execute-changeset
# 2. After review, deploy it
sam deploy --template-file infra/template.yaml --stack-name actionbridge-dental-dev \
  --parameter-overrides AppEnv=dev --capabilities CAPABILITY_IAM --resolve-s3 \
  --region us-east-2 --profile actionbridge
# 3. Live smoke test: creates two synthetic Cognito users with fresh random passwords (never printed)
bash infra/scripts/smoke-aws.sh
```

Code is pre-bundled, so `sam build` is not used. The table and user pool use `DeletionPolicy: Delete`: `sam delete --stack-name actionbridge-dental-dev --region us-east-2 --profile actionbridge` removes the stack and its demo data.
