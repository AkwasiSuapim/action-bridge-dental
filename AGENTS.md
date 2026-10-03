# ActionBridge Dental — instructions for coding assistants

Mobile AI benefits agent: explains likely dental treatment costs under an employee's current plan and compares dentist-permitted timing. AI interprets and explains; the deterministic engine calculates; dentists decide timing.

Read before changing code: `docs/README.md` (index), `docs/DECISIONS.md` (decisions D-01…), `CONTRIBUTING.md` (team workflow). Mobile work: also `mobile/AGENTS.md` (Expo SDK 57 rules) and `mobile/README.md`.

## Layout

- `packages/contracts` — Zod schemas shared by API and app. Change contracts before dependent code, in the same pull request.
- `packages/benefits-engine` — pure calculator and schedule comparison. No I/O, clock, randomness, React or AWS imports (enforced by `boundaries.test.ts`).
- `backend/` — Lambda handlers → application services → ports → DynamoDB adapters. `infra/template.yaml` is the SAM stack.
- `mobile/` — Expo Router app (separate npm project). Consumes `packages/contracts/dist` and `docs/fixtures` via `metro.config.js`.
- `docs/fixtures/` — shared regression fixtures. Do not change expected numbers without the team.

## Invariants (do not break)

- Money is integer cents; rates are basis points (8000 = 80%). Never round display values back into calculations.
- Unknown values are `null` and produce `needs_information` — never default to 0, 50%, January 1 or in-network.
- Only engine results are displayed or saved; the client never sends or invents amounts. Results carry `caseRevision`; stale revisions get 409.
- Errors use the nested envelope `{ error: { code, message, retryable, requestId, issues? } }`.
- No timing change without a dentist-supplied window; no clinical urgency claims; saving is not a claim or payment.
- Live mode never falls back to mock data. Synthetic data is always labeled.
- Never put secrets, passwords, tokens or real patient data in code, docs, logs or commits. `EXPO_PUBLIC_*` values are public.

## Commands

```bash
npm run setup          # install everything and build contracts
npm run check          # strict typecheck + all tests (packages, backend, mobile logic)
npm run check:mobile   # mobile typecheck + mobile tests
npm run dev:api        # local API (in-memory, demo auth) on :3000
cd mobile && npm start # Expo dev server (rebuilds contracts first)
```

Run the relevant checks before declaring work done and report actual results. Mobile packages: `npx expo install <pkg>` only.
