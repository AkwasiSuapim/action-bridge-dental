# 02 — Phased implementation and acceptance plan

ActionBridge Dental · v2.0 · This checklist records work to do, not work already completed.

## 1. How the team uses this plan

Assign a named owner to each phase/task before starting. Roles below are responsibilities, not required team size: **Lead** (scope/demo), **Domain** (math/API), **Cloud** (AWS/agent), **Mobile** (Expo/UI), **QA** (tests/data). People may hold several roles.

- P0 = core release requirement. P1 = bonus/high-value addition after core works. P2 = optional stretch.
- Every task needs a requirement ID, affected files, implementation, test and evidence. A screenshot is not proof that an API or calculation works.
- A phase passes only with both functional and UX evidence. UI is not the final decorative phase.
- Never check a task off because a coding assistant generated files. Run the relevant verification and record the result.
- Status vocabulary: `not_started`, `in_progress`, `blocked`, `verified`, `cut`. “Cut” must not be marketed as implemented.

Upgrade tasks U-01–U-09 are defined in [05_INSURANCE_VOICE_UPGRADE.md](05_INSURANCE_VOICE_UPGRADE.md) §7 and logged in section 14 below; they amend priorities but do not replace these phases.

Documentation work completed in this package: [x] source audit; [x] Dental scope and story; [x] architecture/contracts proposal; [x] phased acceptance plan; [x] mobile/Expo and AWS/data guidance. No Dental implementation task is completed by writing these documents.

## 2. Dependency order and time discipline

| Phase | Entry requirement | Exit deliverable | Suggested effort/timebox |
|---|---|---|---|
| 0 — Permission, scope, access | Team assembled | Recorded decisions, approved sample data, access smoke test | 30–45 min |
| 1 — Baseline and contracts | Phase 0 | Stable source baseline and shared interface | 45–75 min |
| 2 — Benefits engine | Contracts accepted | Tested calculator and bounded optimizer | 2–3 h |
| 3 — Real API slice | Engine fixture passes | Phone calls working estimate/scenario endpoints | 1–2 h |
| 4 — Dental UI | Contracts available; can overlap 2–3 | Complete typed/manual workflow and visual checks | 2–3 h |
| 5 — Agent layer | Deterministic path stable | Actual Bedrock tool flow, questions and events | 1.5–2.5 h |
| 6 — Evidence/actions/bonuses | Core journey passes | Persistent strategy plus selected verified additions | 1–2 h; cut on time |
| 7 — Hardening | Feature freeze candidate | Security, failure, math and device QA evidence | 1.5–2 h reserved |
| 8 — Demo and submission | Release gates pass | Frozen build, source/docs, rehearsed story | 1 h reserved |
| 9 — Expo Web | Explicit mobile success gate | Same product responsive in browser | Optional only |

These are planning estimates, not a promise. At the event, preserve the last 2.5–3 hours for validation and handoff. Target feature freeze by about 8:30 a.m. Eastern October 4 and readiness by 10:00 a.m.; mentor-confirmed timing takes precedence. Do not let optional work consume that reserve.

## 3. Phase 0 — Rules, product and data readiness

Owner: Lead + Cloud + QA. Requirement: no unapproved reuse, data access or account assumptions.

| Task | Priority | Work and acceptance |
|---|---|---|
| T0-01 | P0 | Record organizer clarification on pre-event code/design reuse, AI tools and mobile/web acceptance. If reuse not allowed, keep source as reference only and implement permitted event work with an honest commit history |
| T0-02 | P0 | Confirm current-plan optimization versus plan shopping, deadlines, demo duration, source/access submission rules and sponsor mandates; store exact answer/time/issuer |
| T0-03 | P0 | Obtain the supplied dental materials; record license/permission and fields present. If unavailable, request approval for clearly synthetic fixtures and mark limitations |
| T0-04 | P0 | Verify AWS account/Region, model access, budget alerts and one AgentCore deployment spike. Timebox 30 minutes; escalate permission issues to mentor, preserve manual/API plan |
| T0-05 | P0 | Select primary physical phone and one backup; run the existing allowed app or a fresh permitted baseline on the phone |
| T0-06 | P0 | Choose one plan policy adapter, one employee, up to six procedures, no real patient data; name task owners and test reviewer |

**Exit:** rules recorded; fixture authorized; device and AWS ownership known. Unknowns are visible, not silently treated as approvals.

## 4. Phase 1 — Freeze the baseline and agree on contracts

Owner: Domain + Mobile. Requirement: existing API mismatch resolved in design before parallel implementation.

| Task | Priority | Work and acceptance |
|---|---|---|
| T1-01 | P0 | Preserve original ZIP/source; run install, typecheck, lint and existing tests if code reuse is permitted. Record actual failures and versions; do not rewrite unrelated files |
| T1-02 | P0 | Implement shared runtime schemas from system design: case/revision, plan years, procedures, provenance, estimate, scenario, job, UI block and error. Negative, unknown and conflicting inputs covered |
| T1-03 | P0 | Establish feature-first folders and composition boundaries. Mobile imports no AWS credentials/SDK internals; engine imports no React or cloud modules |
| T1-04 | P0 | Replace/refactor the API interface and mock adapter to the canonical `/v1` contracts. Same fixture must validate for both mock and live paths |
| T1-05 | P0 | Standardize nested errors, idempotency keys, revision conflict and retry rules; add adapter contract tests |
| T1-06 | P0 | Make live/mock mode explicit. Live with missing base URL is a configuration error. Migrate `actionbridge.v1` to a distinct Dental snapshot version with user-visible reset policy |

**Exit:** a contract fixture renders in the phone shell; client/server agree on shape and units; current source state and permitted reuse are recorded.

## 5. Phase 2 — Deterministic financial core

Owner: Domain; reviewer: QA. Requirements: CH-02, CH-03 and BN-01 foundations.

| Task | Priority | Work and acceptance |
|---|---|---|
| T2-01 | P0 | Validate cents, basis points, dates, confirmed fields and applicable policy structure. No unsafe defaults; unsupported plans return explicit errors |
| T2-02 | P0 | Implement deductible, coverage, insurer maximum and per-year sequential accounting. Per-line and aggregate reconciliation pass |
| T2-03 | P0 | Distinguish billed, allowed, write-off and balance-bill values. Unknown allowance cannot become a guaranteed cost |
| T2-04 | P0 | Implement bounded candidate scheduling with dentist windows, prerequisites, fixed dates, actual reset and next-year deductible. Explain search limits |
| T2-05 | P0 | Implement `needs_information`, `estimated`, `unsupported` results. Assumed future coverage is explicit; uncertain savings never presented as guaranteed |
| T2-06 | P0 | Validate the supplied regression fixture: baseline employee 120000 cents; alternative 72500; difference 47500. Assert every line, year and remaining balance |
| T2-07 | P0 | Add invariant and boundary tests from section 13; retain calculator version and input revision in output |

**Exit:** all required math tests pass without Bedrock or AWS. A reviewer independently checks the sample arithmetic. No pending estimate is written into reported insurer-paid usage.

## 6. Phase 3 — Serverless vertical slice

Owner: Cloud + Domain. Requirement: phone sends actual input to actual backend and sees actual calculated output.

| Task | Priority | Work and acceptance |
|---|---|---|
| T3-01 | P0 | Implement Dental create/read/update case and estimate/scenario routes; persist owner/revision; reject stale edits |
| T3-02 | P0 | Extend SAM only for needed routes, roles and storage. Validate/build locally, deploy a named demo stage and capture non-secret outputs |
| T3-03 | P0 | Add managed authentication/authorization (Cognito, U-03; D-10) or isolated synthetic-only demo controls. Check case, job, document and ledger ownership at every lookup |
| T3-04 | P0 | Connect a physical phone with mocks disabled. Run regression inputs, change prior benefit usage, and confirm newly calculated values from AWS |
| T3-05 | P0 | Show offline, incomplete input, timeout, rate limit and API error correctly; correlation IDs are visible in diagnostic UI/logs without exposing data |

**Exit:** manual intake → AWS estimate → scenario display works on the phone. Do not proceed by substituting a timed mock success when live requests fail.

## 7. Phase 4 — Mobile UI as a first-class engineering feature

Owner: Mobile + QA. Requirements: CH-01–03 and UI-G1–G6 in the mobile document. Can begin with validated fixtures during Phase 2.

| Task | Priority | Work and acceptance |
|---|---|---|
| T4-01 | P0 | Preserve theme/fonts/primitives; map referral screens/routes to Dental features; remove program eligibility/referral language from active journey |
| T4-02 | P0 | Build editable treatment and plan confirmation, evidence badges, date/network controls and “I don't know.” Validate no silent loss of input |
| T4-03 | P0 | Implement allowlisted generative UI block renderer with schema validation, revision/field scoping and fallback for unknown blocks |
| T4-04 | P0 | Build cost summary, procedure breakdown and exact reconciliation. No clinician/provider imagery needed to make the numbers understandable |
| T4-05 | P0 | Build comparable scenario cards and plan-year timeline; highlight conditional assumptions, per-year maximum and deductible reset |
| T4-06 | P0 | Add evidence drawer, item-to-source links and correction flow. Editing an input marks prior recommendations stale |
| T4-07 | P0 | Add empty/loading/unknown/error/retry/cancel/resume states; actual progress mapping; preserve the last valid result while explicitly recalculating |
| T4-08 | P0 | Test narrow/wide phone, font scaling, dark/light contrast, screen reader, keyboard/safe areas and reduced motion. Capture screenshots for each primary state |

**Exit:** screen tests and physical-device checks pass; every displayed number matches the engine; no status or meaning relies only on color. UI gate failure blocks release just as a backend gate failure does.

## 8. Phase 5 — Real agent workflow

Owner: Cloud + Domain + Mobile. Requirement: agent chooses relevant work and requests missing data while deterministic code controls calculations.

| Task | Priority | Work and acceptance |
|---|---|---|
| T5-01 | P0 | Implement Bedrock structured interpretation behind a port; preserve exact source references, uncertain fields and contradictions; never infer clinical urgency |
| T5-02 | P0 | Host one agent on selected AgentCore Runtime; pin working model/runtime version and give only needed permissions. Record actual tool invocation evidence |
| T5-03 | P0 | Implement extract/missing-facts/evidence/estimate/compare/explain tools; cap turns; adapt question types to real missing fields; reject arbitrary generated components/tools |
| T5-04 | P0 | Add job queue/worker, bounded retries/leases, persisted status and real stage events. Phone can resume; stale jobs cannot overwrite current revision |
| T5-05 | P0 | Evaluate extraction and numeric fidelity on at least five cases: complete, missing, contradictory, unsupported and adversarial document text |
| T5-06 | P0 | Simulate AI timeout/malformed JSON/tool failure and prove manual entry/calculation still works. Explain degraded mode honestly |

**Exit:** Bedrock and tools actually run. If Runtime is blocked, record deviation and seek mentor guidance; a Lambda-hosted/direct-model fallback may preserve useful functionality but is not a completed Runtime deployment.

## 9. Phase 6 — Persistence, data intake and bonuses

Owner: Domain + Mobile + Cloud. Complete each selected addition end to end; cut the rest explicitly.

| Task | Priority | Work and acceptance |
|---|---|---|
| T6-01 | P0 | Save selected strategy with revision, provenance and explicit user action; append immutable ledger event. Repeated taps create one logical save |
| T6-02 | P1 | Finish annual maximum tracker: reported paid, planned projection and remaining by year; replace selected scenario rather than accumulate every comparison |
| T6-03 | P1 | Implement network comparison only when required allowed amounts/rates are supplied. Otherwise show unavailable/conditional result without pretending provider lookup |
| T6-04 | P1 | Implement one opt-in reminder channel, cancellation and evidence of real delivery. Default local notification for speed; EventBridge plus channel only if verified and worth the integration |
| T6-05 | Requested (U-06) | Implement private upload, camera capture, input limits, ownership, S3, supported text/OCR processing and extracted-field review. Unreadable documents fall back to manual entry |
| T6-06 | P2 | Implement share/export through device share sheet with preview and field selection. “Share sheet opened” is not “delivered to dentist” |
| T6-07 | Requested (U-07) | Replace voice mock with permission-aware recording and Amazon Transcribe for intake and follow-up answers; editable transcript; retain typed fallback |

**Exit:** stored strategy survives reload; all enabled additions have measured proof. Local reminder fallback is a deliberate design decision, not an invisible claim of EventBridge execution.

## 10. Phase 7 — Hardening and release review

Owner: QA, all implementers. Entry: no new core feature planned.

| Task | Priority | Work and acceptance |
|---|---|---|
| T7-01 | P0 | Run regression matrix and end-to-end API/phone journey; save result logs and exact source commit |
| T7-02 | P0 | Verify stale revisions, duplicate queue messages, duplicate taps, rapid edits, slow server, app background/resume, cold start and retry limits |
| T7-03 | P0 | Secret-scan repository/bundles; private bucket check; review IAM; inspect logs for raw personal data; validate retention/deletion behavior |
| T7-04 | P0 | Test cross-user case/job/document access denial, prompt injection, unsupported UI blocks and unauthorized side effects |
| T7-05 | P0 | Measure calculator latency and real agent elapsed time; cap token/tool/search work. Set a visible timeout and recovery; never invent a speed claim |
| T7-06 | P0 | Sign off mobile UI-G1–G6 and verify limitations are readable, not hidden in legal text; label every live/mock/cached state |

**Exit:** zero known P0 bugs, all claimed capabilities verified, limitations documented. “Zero known critical bugs” is not a promise of zero defects.

## 11. Phase 8 — Demo, submission and handoff

Owner: Lead + everyone.

| Task | Priority | Work and acceptance |
|---|---|---|
| T8-01 | P0 | Run three full physical-phone journeys from fresh launch using live API. Include changed input, source view and saved ledger; record timing/results |
| T8-02 | P0 | Rehearse one human story under the confirmed limit; have teammates explain math, architecture, source limitations and safety without overstating capabilities |
| T8-03 | P0 | Prepare projection/mirroring, labeled fallback recording/screenshots, charged phone and tested network alternative |
| T8-04 | P0 | Submit working access/build instructions, source link, description, credentials if required, demo and attribution/license notes before confirmed cutoff |
| T8-05 | P0 | Freeze stable commit/deployment/build; prevent last-minute optional changes; write cleanup owner and time |

**Exit:** all ten judging rows have concrete evidence, not only planned features. Onsite submission and licensing rules are confirmed; the team knows remaining limitations.

## 12. Phase 9 — Optional Expo Web

Owner: Mobile. Entry is strict: Phases 7–8 mobile rehearsals pass, no P0 bugs, backup exists, and enough time remains before freeze.

| Task | Priority | Work and acceptance |
|---|---|---|
| T9-01 | P2 | Confirm time budget and create a separate safe branch; keep same API/engine/contracts |
| T9-02 | P2 | Adapt same screens to desktop layout and keyboard navigation; no second state machine or backend |
| T9-03 | P2 | Test browser upload, auth redirect, notification differences, CORS, deep links and data privacy |
| T9-04 | P2 | Run production web export and browser QA, then rerun mobile tests. Merge only if both remain stable |

Web is an extension, not a requirement for mobile completion. Never reset/delete the working mobile app to add it.

## 13. Required test matrix

| ID | Case | Pass condition |
|---|---|---|
| Q-01 | Supplied fictional fixture | 120000/72500 employee cents; 47500 difference; all per-line values match |
| Q-02 | Deductible already met | No second deductible; arithmetic reconciles |
| Q-03 | Maximum exhausted/mid-procedure cap | Payment capped correctly; shortfall visible |
| Q-04 | Reset in a non-January month | Correct actual benefit period; no calendar-year shortcut |
| Q-05 | Next-year plan unknown | Conditional unchanged-plan assumption or blocked comparison |
| Q-06 | Allowed amount/rate unknown | Targeted question; no fabricated exact saving |
| Q-07 | Exclusion/waiting/frequency condition | Not falsely covered; unsupported rule explicitly disclosed |
| Q-08 | In-network write-off versus out-of-network balance bill | Fictional 1500/1000 charge/allowance example reconciles to 525 versus 1025 employee cost |
| Q-09 | Fixed crown date/no clinician window | No proposed delay, even if cheaper |
| Q-10 | Dependency cycle/invalid dates | Rejected with actionable error |
| Q-11 | No cheaper feasible alternative | Honest no-alternative result, no forced “best savings” card |
| Q-12 | Negative/NaN/overflow/rate above 100% | Schema rejection; no corrupted computation |
| Q-13 | Fractional-cent rounding | Explicit engine rounding; displayed rows sum to totals |
| Q-14 | User changes inputs during analysis | Stale job ignored; prior recommendation labeled stale |
| Q-15 | Extraction conflict and fabricated citation | Conflict unresolved; unsupported source not displayed as verified |
| Q-16 | Duplicate save/reminder request | Idempotent result; no duplicate ledger side effect |
| Q-17 | Claimed benefits versus projected benefits | Saving comparison does not change reported insurer-paid total |
| Q-18 | Unauthorized resource/document access | Denied server-side, not merely hidden in UI |
| Q-19 | API/AI/OCR failure | Correct recovery path and truthful status |
| Q-20 | Reminder denied/canceled/not delivered | UI reflects actual state, no success claim |
| Q-21 | Large font/reduced motion/screen reader | Equivalent information and operability |
| Q-22 | App restart/network reconnect | Correct case/job recovery; no repeat external action |

## 14. Completion and change log

Use one row per verified task; leave empty until evidence exists.

| Task | Owner | Status | Commit/build | Test/device/evidence | Remaining issue |
|---|---|---|---|---|---|
| T0-01…T0-06 | Assign before work | see [DECISIONS.md](DECISIONS.md) | — | — | Human tasks; T0-06 technical scope decided |
| T1-01 | — | blocked | — | Original ZIP/starter not in this repo | Depends on T0-01 reuse answer (D-04) |
| T1-02 | Unassigned; coding assistant implemented | verified | branch `feat/phase0-1-contracts-engine` | `npm run check` 2026-10-03, Node 24.21: `contracts/test/schemas.test.ts` — fixture parses; Q-12 rejections; nulls stay null; strict unknown-field rejection; UI blocks; job view; error envelope | Mobile and backend adapters not yet consuming it |
| T1-03 | Unassigned; coding assistant implemented | in_progress | same | `boundaries.test.ts`: engine imports only contracts, no clock/randomness/env; contracts import only zod | `mobile/`, `backend/`, `infra/` not yet created |
| T1-04 | — | not_started | — | — | Needs mobile/backend adapters |
| T1-05 | Unassigned; coding assistant implemented | in_progress | same | Nested envelope, HTTP mapping (D-02), `Idempotency-Key`, bounded jittered retry policy tested | Adapter contract tests once adapters exist |
| T1-06 | — | not_started | — | — | Mobile app not in repo |
| T2-01…T2-05, T2-07 | Unassigned; coding assistant implemented | verified | same | 87/87 tests: Q-02–Q-11, Q-13, Q-17, contradictions → `invalid`; engine version and case revision on every result | Q-14–Q-16, Q-18+ belong to API/agent/UI phases |
| T2-06 | Unassigned; coding assistant implemented | verified (automated) | same | `fixture.test.ts`: 120000 / 72500 / 47500 cents, every line, year and remaining balance | **Phase 2 exit needs a human reviewer to check the arithmetic independently** |
| T3-01 | Unassigned; coding assistant implemented | verified (local) | same | `backend/test/api.test.ts` (in-memory store): create/read/patch, owner + revision persisted, stale and concurrent edits → 409, estimate/scenarios with fixture values, `needs_information`/`unsupported` 200, contradictions 422. Bundled local server: `npm run smoke` 9/9 PASS over HTTP, 2026-10-03 | Not yet run against DynamoDB in AWS |
| T3-02 | Unassigned; coding assistant implemented | verified | stack `actionbridge-dental-dev`, us-east-2, 2026-10-03 | Change set reviewed and approved by owner, then executed: `CREATE_COMPLETE` (21 resources). `sam validate --lint` and `cfn-lint` clean. Outputs: `ApiBaseUrl` https://ihcdqmzc6b.execute-api.us-east-2.amazonaws.com/dev, `UserPoolClientId` kcpgj90ruhsav9tin680padr4, `UserPoolId` us-east-2_in8mqQVUv. CloudWatch request logs contain only IDs/route/status/duration (inspected) | Stable `demo` stage not yet deployed |
| T3-03 | Unassigned; coding assistant implemented | verified (API) | same | Cognito user pool (admin-created users only) + HTTP API JWT authorizer (issuer/audience); `infra/scripts/smoke-aws.sh` live: no token → 401, second Cognito user reading the first user's case → 404 | Mobile sign-in (PKCE or native form) belongs to Phase 4; job/document/ledger ownership checks arrive with those features |
| U-01 | Unassigned; coding assistant implemented | verified | branch `feat/phase0-1-contracts-engine` | `coverageMode`, `selfPayQuote` (0 allowed, unknown null), `InsurerVerification` (bare "verified" rejected), `CoverageIssue`, D-13 block registry (`missing_field` with typed inputs and response modes, `cost_comparison`, `coverage_issue`, `source_evidence`, `next_step`), `transcribe_audio` job, answers with `responseMode`. `contracts/test/ui-blocks.test.ts` | Mobile renderer pending (U-04/U-05) |
| U-02 | Unassigned; coding assistant implemented | verified | same; deployed to `actionbridge-dental-dev` (`UPDATE_COMPLETE`) | `compareCoverage` + `POST /v1/cases/{caseId}/coverage-comparison`; fixture `self-pay-comparison.json` $525 vs $1,200 → $675; zero vs unknown quote; cash below insured; self-pay mode; $1,200/$725 fixture unchanged; live smoke 10/10 after deploy | — |
| U-03 | Unassigned; coding assistant implemented | in_progress | same | Cognito pool + JWT authorizer live (T3-03); mobile native sign-in with refresh/revoke (D-15), unit-tested against a fake Cognito endpoint | 2026-10-03, owner's phone (Expo Go): demo user `maya.demo@example.com` signed in with a temporary password and completed the new-password challenge (Cognito status FORCE_CHANGE_PASSWORD → CONFIRMED). Logout and expired-token handling still to be observed on the phone |
| U-04–U-09 | — | not_started | — | — | See doc 05 §7; U-04/U-05 build on the team UI plus `mobile/src/lib/questions.ts` |
| T6-01 | Unassigned; coding assistant implemented | verified (API) | same; deployed to `actionbridge-dental-dev` 2026-10-03 (IAM change approved by owner: `ConditionCheckItem`, `Query` on the table only) | `POST /v1/cases/{caseId}/strategies` (Idempotency-Key; server-recomputed scenario snapshot) and `GET /v1/cases/{caseId}/ledger`. One DynamoDB transaction per save (revision check + key + strategy + event); case create/update events written in the same transaction as the change. `backend/test/strategies.test.ts`: double tap and concurrent same-key saves → one save and one event; reused key 409; stale 409; unknown option 404; incomplete case 422; other user 404; Q-17 case unchanged after save; ledger newest first, no plan values, paging. Live `smoke-aws.sh` 13/13 | Save/ledger screens belong to the team UI; Q-16 reminder half pending (T6-04) |
| Phase 4 team UI (T4-01–T4-07) | Team (branch `feat/mobile-ui`, merged) | in_progress | `dda8cb9` on `feat/phase0-1-contracts-engine` | Merged design v3: welcome/sign-in, tabs (home, my plan, activity, profile), typed intake → adaptive questions → coverage rules, facts/edit, options and self-pay, plan and sources, review/save/saved. Verified 2026-10-03 on the merged commit: 219/219 tests; mobile `tsc --noEmit` clean with freshly generated typed routes; `expo-doctor` 21/21; Android bundle 6 MB; no hard-coded amounts or mock data in screens 2026-10-03 owner's phone walkthrough against AWS (CloudWatch, 40-min window): create 201 → estimate 200 → scenarios 200 ×3 → coverage-comparison 200 (first live use) → save strategy 201 → ledger 200 ×2; zero 4xx/5xx | **Changed-input step not yet exercised from the phone** (no PATCH logged): edit a detail and confirm recalculation (T3-04). T4-08 device checks (font scaling, dark mode, screen reader, narrow width) not yet recorded. ESLint not configured (`expo lint` fails to start) |
| Phase 4 foundation | Unassigned; coding assistant implemented | in_progress | same | `mobile/`: Expo 57.0.26 / RN 0.86.3; `tsc --noEmit` clean; `expo-doctor` 21/21; `expo export --platform android` bundle OK (5.8 MB); 17 unit tests (format, config, adaptive questions, API client incl. contract validation/retry/errors, Cognito client) | Team UI to be merged (D-16); not yet run on a physical phone (T3-04, T4-08) |
| T3-04 | — | in_progress | same | Live API journey verified from the laptop (`smoke-aws.sh` 10/10 PASS, 2026-10-03): create → read → estimate $1,200.00 → scenarios $725.00/$475.00 → change prior usage → $900.00 → stale revision 409. **Phone:** 2026-10-03, owner's physical phone (Expo Go, live mode, no mocks): owner reported a successful sample run; CloudWatch shows 3 phone-originated `POST /v1/cases` (201) each followed by estimates and scenarios (200) | Changing prior benefit usage **from the phone** needs the team UI's edit screen; then re-run and confirm the recalculated value |
| T3-05 | Unassigned; coding assistant implemented | in_progress | same | Server side: 400 with field issues, oversized body, unknown route/malformed ID 404, generic 500 without internal detail, `x-request-id` = envelope `requestId`, logs limited to IDs/status/timing (tested) | Mobile offline/timeout/rate-limit display belongs to Phase 4 |

For a new organizer requirement, record: time, exact clarification, authority, affected CH/BN IDs, contract/UI/backend impact, scope cut to pay for it, tests to rerun and approver. Protect the main workflow instead of adding an unbounded feature.

Coding-assistant handoff: Read all five documents and applicable `AGENTS.md`; state the task ID and acceptance target; inspect current code; preserve unrelated work; implement the smallest coherent slice; run checks; report actual outcomes and blockers; never mark unrun tests passed or simulated actions delivered.
