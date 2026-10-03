# ActionBridge Dental

A mobile AI benefits agent that explains what dentist-recommended treatment is likely to cost under an employee's current dental plan, and compares clinically permitted ways to schedule it across benefit years. AI interprets and explains; deterministic code calculates; dentists determine timing.

**New to the team? Start with [CONTRIBUTING.md](CONTRIBUTING.md)** — setup, branch workflow and where the mobile UI goes.

Product and plan: [docs/README.md](docs/README.md). Decisions and Phase 0 status: [docs/DECISIONS.md](docs/DECISIONS.md). Task status: [build plan log](docs/02_BUILD_PLAN.md#14-completion-and-change-log).

## Repository layout

| Path | Contents | Status |
|---|---|---|
| `docs/` | Brief, system design, build plan, AWS and mobile guides, regression fixture | Current |
| `packages/contracts/` | Zod runtime schemas and shared types: case, plan years, procedures, provenance, estimates, scenarios, jobs, UI blocks, errors | Implemented (T1-02) |
| `packages/benefits-engine/` | Pure integer-cent calculator and bounded schedule comparison | Implemented (Phase 2) |
| `backend/` | Lambda handlers, application services, DynamoDB adapter, local server, smoke test — see [backend/README.md](backend/README.md) | Phase 3 deployed and verified live; agent (Phase 5) not started |
| `infra/` | SAM template: HTTP API + Cognito JWT authorizer, three Lambdas, DynamoDB; live smoke and demo-login scripts | Deployed to Ohio (`actionbridge-dental-dev`), live smoke 13/13 |
| `mobile/` | Expo SDK 57 foundation: Cognito sign-in, typed live API client, theme and primitives — see [mobile/README.md](mobile/README.md) | Foundation built; team UI to be merged |

## Commands

Requires Node 22.13 or later.

```bash
npm run setup     # first time: root install + build contracts + mobile install
npm run check     # strict typecheck (packages and tests) + all tests
npm run check:mobile  # mobile typecheck + mobile tests
npm test          # tests only
npm run build     # compile packages to dist/
npm run dev:api   # local API on http://localhost:3000 (in-memory, demo auth)
npm run build:lambda  # bundle Lambdas into backend/.build/ for SAM
```

## Using the engine

```ts
import { DentalCaseInputSchema } from '@actionbridge/contracts';
import { compareSchedules, estimateCase } from '@actionbridge/benefits-engine';

const input = DentalCaseInputSchema.parse(body); // 400 on malformed input
const estimate = estimateCase(input);             // estimated | needs_information | unsupported | invalid (422)
const comparison = compareSchedules(input);       // baseline + up to two lower-cost permitted alternatives
```

All money is integer USD cents and rates are basis points. Unknown values are `null` and produce `needs_information`, never a default. The fixture's fictional case yields $1,200 (all this year) versus $725 (crown after the reset); see [the fixture](docs/fixtures/dental-regression.json).
