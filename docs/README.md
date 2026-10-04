# ActionBridge Dental — team build documentation

Version 2.0 · 3 October 2026 · Mobile first; web after the release gate.

This is a **documentation and implementation-planning package**, not a rebuilt application. The uploaded mobile source and earlier backend starter have not been changed. Put the `docs/` directory beside `mobile/`, `backend/`, `packages/`, and `infra/` in the permitted team repository.

## Read in this order

| File | Purpose | Main reader |
|---|---|---|
| [00_PROJECT_BRIEF.md](00_PROJECT_BRIEF.md) | Problem, human story, scope, challenge and judging alignment | Everyone |
| [01_SYSTEM_DESIGN.md](01_SYSTEM_DESIGN.md) | Source audit, target architecture, contracts, calculation and data model | Backend, agent, mobile |
| [02_BUILD_PLAN.md](02_BUILD_PLAN.md) | Task IDs, dependencies, phase requirements, tests and release gates | Team lead and all implementers |
| [03_STACK_AWS_SETUP.md](03_STACK_AWS_SETUP.md) | Accounts, AWS setup, data acquisition, official links and deployment checks | AWS and data owners |
| [04_MOBILE_UI_AND_EXPO.md](04_MOBILE_UI_AND_EXPO.md) | Screen migration, generative UI, data presentation, Expo setup and device QA | Mobile, design, QA |
| [dental-regression.json](fixtures/dental-regression.json) | Explicitly fictional, numerically checked acceptance fixture (v2, see D-01/D-03) | Calculator, API and UI tests |
| [05_INSURANCE_VOICE_UPGRADE.md](05_INSURANCE_VOICE_UPGRADE.md) | Upgrade: insured/self-pay comparison, coverage review, adaptive answers, voice and camera input, Cognito; U-01–U-09 | Everyone |
| [evals/agent-eval-results.md](evals/agent-eval-results.md) | Agent extraction evaluation against the real model: complete, missing, contradictory, unsupported, adversarial (T5-05) | Everyone, judges |
| [DECISIONS.md](DECISIONS.md) | Technical decisions, Phase 0 register and organizer clarification log | Everyone |

Documents 00–04 replace the generic referral-oriented planning documents for the Dental build; document 05 amends selected priorities and contracts (see D-10 to D-13 in DECISIONS.md). Do not mix old referral endpoints with the Dental contracts in this package. The current `DENTALPATH_BUILD_SPEC.md` was reviewed and reconciled: **ActionBridge Dental** is the chosen product name; its clinically constrained calculation principles are retained. Where deployment and reminder options differed, this package records the chosen target and explicit fallback instead of promising both paths.

## Decisions to keep stable

1. One employee, one current dental plan, a small set of proposed procedures. This is treatment optimization, not insurance-plan shopping.
2. Expo React Native + TypeScript; preserve the existing green visual system and thin Expo Router routes.
3. Tested, integer-cent financial calculations; AI interprets and explains but does not set the answer.
4. One Bedrock-powered agent, with AgentCore Runtime as our target hosting choice. The opening deck presents that deployment path; confirm any sponsor-specific mandatory services onsite.
5. Manual input remains available. Photo/PDF extraction and voice must never block the basic estimate.
6. No timing changes without a dentist-supplied permissible window. No app-generated clinical urgency assessment.
7. Planned benefit usage is separate from reported insurer-paid usage. Saving a strategy does not spend benefits or reserve insurer funds.
8. No web work until mobile passes the final gate. Projection/screen mirroring can make the mobile demo presentable without another frontend.

## Start with these four actions

- Confirm permitted reuse of pre-event code/designs and record the organizer's answer. The starter explicitly identifies itself as pre-event reference material; do not silently assume it is eligible for submission.
- Assign owners to Phase 0 in the build plan; obtain the actual dental reference materials and confirm their permitted use.
- Agree on the shared `/v1` contracts before renaming routes or connecting live AWS.
- Implement the fictional $1,200 versus $725 regression case through the calculator, API and phone UI before adding extraction complexity.

## What was reviewed and what was not

Reviewed: the supplied `actionbridge-mobile(1).zip`, its five test files, package/configuration, route structure, state machine, theme, voice mock, API adapter and local persistence; the earlier serverless starter routes/SAM template; existing project documents; current DentalPath specification; official challenge and current technical reference pages.

Uploaded ZIP SHA-256: `6bed662b18ef135731847cc45e87fa7d0bd48f8013045c71ff972f444d1658de`.

This documentation pass does **not** claim that the app was installed, built, tested on a device, deployed to AWS, or converted to Dental. Existing README test/build claims are not fresh verification. All implementation checkboxes remain open unless explicitly marked as documentation work. No claim of guaranteed judging success or zero defects is made.

Documentation checks passed: nine internal links, three embedded JSON examples, 60 unique task IDs and their references, six UI gates, both fixture scenarios and their per-year arithmetic, and the unchanged original-upload SHA-256. These checks do not validate the future application implementation. The ZIP is also integrity-checked before delivery.

## How to update this package

For each completed task, record owner, commit, command/device, result and evidence in the build-plan log. Update the contract before dependent code. Keep unsupported capabilities visibly unavailable rather than silently replacing live results with mocks. Do not put passwords, real patient records or AWS secrets in these documents.
