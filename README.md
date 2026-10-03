# ActionBridge Dental

A mobile AI benefits agent that explains what dentist-recommended treatment is likely to cost under an employee's current dental plan, and compares clinically permitted ways to schedule it across benefit years. AI interprets and explains; deterministic code calculates; dentists determine timing.

Start with [docs/README.md](docs/README.md). Decisions and Phase 0 status are in [docs/DECISIONS.md](docs/DECISIONS.md); task status is in the [build plan log](docs/02_BUILD_PLAN.md#14-completion-and-change-log).

## Repository layout

| Path | Contents | Status |
|---|---|---|
| `docs/` | Brief, system design, build plan, AWS and mobile guides, regression fixture | Current |
| `packages/contracts/` | Zod runtime schemas and shared types: case, plan years, procedures, provenance, estimates, scenarios, jobs, UI blocks, errors | Implemented (T1-02) |
| `packages/benefits-engine/` | Pure integer-cent calculator and bounded schedule comparison | Implemented (Phase 2) |
| `backend/`, `infra/` | Lambda handlers, agent, SAM | Not started (Phase 3, 5) |
| `mobile/` | Expo React Native app | Not started (Phase 4) |

## Commands

Requires Node 22.13 or later.

```bash
npm ci            # install
npm run check     # strict typecheck (packages and tests) + all tests
npm test          # tests only
npm run build     # compile packages to dist/
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
