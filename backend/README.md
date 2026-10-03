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

- **`AUTH_MODE=demo`** (current template): each device sends a random `x-demo-user-id` (16–64 letters, digits or hyphens). This isolates demo sessions from each other but is **not authentication**. Use only synthetic data; the stage is throttled (burst 20, 10 req/s).
- **`AUTH_MODE=jwt`**: owner is the `sub` claim from an API Gateway JWT authorizer. To enable, add to `HttpApi` in `infra/template.yaml` and set `AUTH_MODE: jwt`:

  ```yaml
  Auth:
    DefaultAuthorizer: Jwt
    Authorizers:
      Jwt:
        IdentitySource: $request.header.Authorization
        JwtConfiguration:
          issuer: https://cognito-idp.<region>.amazonaws.com/<user-pool-id>
          audience: [<app-client-id>]
  ```

  and give `/health` `Auth: { Authorizer: NONE }`. Required before any real document or patient data.

## Run locally (no AWS)

```bash
npm run dev:api                          # from repo root; http://localhost:3000, in-memory, demo auth
API_BASE_URL=http://localhost:3000 npm run smoke -w backend
```

A phone cannot reach `localhost` on your laptop. Use the laptop's LAN IP on a network without client isolation.

## Deploy (requires SAM CLI and an authorized AWS profile)

From the repository root, after confirming the account and Region (T0-04):

```bash
npm run build:lambda
aws sts get-caller-identity --profile actionbridge
sam validate --lint --template-file infra/template.yaml
sam deploy --guided --template-file infra/template.yaml \
  --stack-name actionbridge-dental-dev --parameter-overrides AppEnv=dev \
  --capabilities CAPABILITY_IAM --resolve-s3 --profile actionbridge
API_BASE_URL=<ApiBaseUrl output> npm run smoke -w backend
```

Code is pre-bundled, so `sam build` is not used. Review the IAM changes in the deploy prompt. The table uses `DeletionPolicy: Delete`: deleting the stack deletes its demo data.
