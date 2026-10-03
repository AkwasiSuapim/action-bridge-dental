# Decisions and Phase 0 register

ActionBridge Dental · Record every scope, contract or rules decision here with who decided and when. Change contracts before dependent code.

## Technical decisions

| ID | Date | Decision | Why | Affects |
|---|---|---|---|---|
| D-01 | 2026-10-03 | **Candidate dates.** A procedure's baseline date is its `proposedDate`, else `dentistEarliestDate`. It is movable only with a dentist-supplied window where earliest < latest. Its single alternative date is the earliest permitted date in the next supplied plan year: `max(dentistEarliestDate, nextPlanYear.startDate)`. Within-year shifts and moves to an earlier plan year are not modeled. | The previous fixture used 2027‑01‑10, which no stated rule produced. A deterministic rule makes the optimizer testable. Dollar amounts are unchanged. | Fixture v2 (crown → 2027‑01‑01), engine `compareSchedules`, system design §5 |
| D-02 | 2026-10-03 | **Status vs error.** Incomplete inputs → HTTP 200 `status: "needs_information"` with field paths. Unsupported plan rules → 200 `status: "unsupported"`. Schema-malformed → 400 `BAD_REQUEST`. Well-formed but contradictory (allowed > billed, deductible met > deductible, dependency cycle, overlapping plan years) → 422 `INCONSISTENT_INPUT`. | One unambiguous rule for client and server; incomplete is a normal step in the conversation, not an error. | Contracts `ERROR_HTTP_STATUS`, engine `invalid` result, system design §6 |
| D-03 | 2026-10-03 | **Plan-year keys.** Plan years are keyed by stable IDs (`py-2026`) with explicit start/end dates, never by calendar year. Field paths address procedures by ID: `procedures.crown-1.allowedCents`. | Non-January resets (Q-04); stable paths survive reordering. | Fixture v2, contracts, UI block field paths |
| D-04 | 2026-10-03 | **Build fresh in this repository.** Contracts and engine are new code; the pre-event mobile ZIP and serverless starter are not in this repo. If T0-01 permits reuse, migrate deliberately with the screen map in doc 04. | Avoids relying on unconfirmed reuse permission; keeps an honest commit history. | All phases; revisit after T0-01 |
| D-05 | 2026-10-03 | **Comparison outcomes.** `ScenarioComparison.outcome` is one of `alternatives_found`, `no_lower_cost_alternative`, `no_flexible_timing`, `comparison_incomplete` (a later-date option could not be compared; see `limitations`). | Q-05/Q-11: the UI must distinguish "nothing cheaper" from "could not compare". | Contracts, mobile strategy screen |
| D-06 | 2026-10-03 | **Tooling.** npm workspaces, TypeScript 5.9 strict (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod 4, Vitest 5. Node ≥ 22.13. Packages compile to `dist/`; tests run against source. | Matches the stack doc; TypeScript 7 deferred to avoid toolchain surprises during the event. | Root `package.json`, `tsconfig.base.json` |

## Phase 0 — rules, product and data readiness

These tasks need a person, not code. Record the exact answer, who gave it and when. Unknowns stay visibly unknown.

| Task | Status | Owner | Answer / evidence (issuer, time) | Notes |
|---|---|---|---|---|
| T0-01 Pre-event code/design reuse, AI tools, mobile vs web | not_started | — | — | Blocks any migration of the old mobile ZIP (see D-04) |
| T0-02 Current-plan optimization vs plan shopping, deadlines, demo length, submission rules, sponsor mandates (AgentCore required?) | not_started | — | — | Deck and Devpost times differ; plan for 10:00 a.m. ET Oct 4 until confirmed |
| T0-03 Obtain dental materials; record license/permitted use | not_started | — | — | Short links in doc 03 §10 unresolved; until then only the fictional fixture is used |
| T0-04 AWS account/Region, Bedrock model access, budget alert, 30‑min AgentCore spike | not_started | — | — | AWS CLI 2.37.9 installed on the dev laptop; **SAM CLI not installed** |
| T0-05 Primary + backup physical phone running a baseline app | not_started | — | — | Windows laptop: no local iOS simulator |
| T0-06 One policy adapter, one employee, ≤ 6 procedures, no real patient data; owners and test reviewer | in_progress | — | Technical part decided: policy adapter `fictional-individual-ppo-v1`; engine enforces ≤ 6 procedures and rejects unsupported rules | Name owners and a reviewer for the arithmetic (T2-06) |

## Organizer clarification log

Use one row per clarification: time, exact wording, authority, affected CH/BN IDs, contract/UI/backend impact, scope cut to pay for it, tests to rerun, approver.

| Time | Clarification | Authority | Affects | Impact and cut | Approver |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
