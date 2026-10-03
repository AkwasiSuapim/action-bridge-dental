# 00 — Project brief, story and challenge fit

ActionBridge Dental · v2.0 · Proposed implementation, not completed functionality.

## 1. The idea in plain language

ActionBridge Dental is a mobile AI benefits agent that helps an employee understand the likely cost of dentist-recommended treatment and compare financially different, clinically permissible ways to schedule it. It connects the treatment estimate, the plan's rules and the employee's remaining benefits, then makes the reasoning visible.

**Promise:** Understand the estimate. See the evidence. Choose the next step with confidence.

Primary user: an employee with dental coverage and one or more dentist-recommended procedures. The hard problem is not defining “deductible.” It is combining incomplete documents and benefit balances into a trustworthy, understandable decision before treatment.

We do not determine whether treatment is necessary, decide that a delay is medically safe, issue insurance guarantees, adjudicate claims, or recommend unnecessary care to exhaust benefits.

## 2. Human storyline

Maya has a treatment estimate for two fillings and a crown. She has insurance, yet cannot tell how much she will owe. The paperwork uses percentages, codes and an annual maximum. She worries about committing to a bill she cannot predict and does not want to postpone needed care.

She opens ActionBridge and describes the situation. The app turns her information into an editable treatment and benefits summary. Instead of requiring a long questionnaire, it asks for the remaining facts that actually affect the estimate. It explains why each question matters.

Maya sees the cost of completing everything now. If her dentist has supplied a flexible window for the crown, she can compare a plan-year alternative. The app exposes the assumptions, including next year's deductible and whether next year's coverage is known. She can inspect each amount, save a strategy and prepare questions for her dentist or insurer.

The emotional transition is **uncertainty → understanding → control**. Do not use fear, guilt, artificial urgency, or “use it or lose it” pressure. The meaningful outcome is an informed conversation and a practical plan, not merely a lower-looking number.

## 3. The agent's job

1. Interpret typed text and, when implemented, uploaded documents or transcribed speech.
2. Propose structured procedures, plan terms and source references.
3. Ask only unresolved, decision-relevant questions; allow “I don't know.”
4. Run deterministic estimate and schedule tools using confirmed inputs.
5. Explain differences using the actual tool outputs and their supporting rules.
6. Present only supported actions: save, export through the device share sheet, and opt-in reminders when implemented.
7. Record the selected strategy and action status without pretending a claim was paid or a message delivered.

The original ActionBridge structure remains useful: intake, clarification, progress, comparison, approval and ledger. Program search and referrals become plan evidence, treatment scenarios and benefits follow-up.

## 4. Scope and success levels

| Level | Required outcome | What can be cut |
|---|---|---|
| Core challenge, P0 | Manual/text intake; confirmed plan fields; itemized cost estimate; clinically constrained two-year comparison; sources/assumptions; phone-to-AWS integration | Nothing in this row without recording a core gap |
| Distinctive agent/UI, P0 | Bedrock-assisted understanding; actual tool calls; adaptive questions; real progress; cost reconciliation; evidence drawer | Voice, elaborate motion and decorative visual effects |
| Bonuses, P1 | Annual benefit tracker, like-for-like network comparison, one opt-in reminder path | Finish individually; never advertise unfinished bonuses |
| Requested input scope (doc 05) | Voice recognition (U-07), then document upload and camera capture (U-06); insured/self-pay comparison (U-02) | Each integration is timeboxed with a typed fallback; if blocked, report it as incomplete rather than cut silently |
| Stretch, P2 | Robust multi-page extraction, richer export, spoken responses, Expo Web | Cut first when a core gate is at risk |

Prefer one documented plan and three procedures. Expand to a maximum of six procedures over two benefit years only after tests pass. Unsupported plan structures must return an explicit limitation rather than approximate silently. Do not build a general insurer marketplace, provider search engine, payment service, or appointment-booking product.

## 5. Requirement traceability

Source: official opening presentation, slide 13; reference links on slide 14. Paraphrased here, not an invented expanded challenge.

| ID | Challenge item | Build behavior | Acceptance evidence |
|---|---|---|---|
| CH-01 | Describe planned procedure and current plan | Typed intake and editable treatment/plan fields; extraction optional | Phone captures at least one procedure and the necessary plan values |
| CH-02 | Explain likely coverage and employee cost | Line-item insurer/patient estimate with cited rules | Numbers reconcile; unknowns remain visible |
| CH-03 | Sequence recommended care across the plan year | Baseline and permissible alternatives with actual benefit-year reset | Fixture totals match; fixed-date care is never shifted |
| BN-01 | Track annual maximum usage | Reported paid usage and separately projected selected-strategy usage | Changing prior payments updates the projection without double counting |
| BN-02 | Compare network costs | Separate provider quotes, allowed amounts and network policies | Like-for-like comparison; balance billing distinguished from write-off |
| BN-03 | Remind about unused benefits | One opt-in, cancelable reminder path | A real test notification arrives; scheduling alone is not delivery |

The title mentions benefits “selection,” but the numbered requirements concern a current plan. Confirm any expectation of plan shopping with a mentor before adding it.

## 6. One consistent demonstration fixture

All figures below are **fictional test data**, not Lincoln plan terms, FAIR Health prices, or measured savings. The complete input and expected output are in [dental-regression.json](fixtures/dental-regression.json).

- Current insurer annual maximum: $800; insurer already paid $500; $300 remaining.
- $50 deductible remains; basic services pay 80%, major services 50%, after deductible.
- Two fillings: $250 each. Crown: $1,000. For this fixture, billed equals allowed.
- Next year's fictional maximum is $800 and deductible resets to $50. Coverage and prices are explicitly assumed unchanged.
- Fillings stay this year. The fictional dentist-supplied crown window permits either candidate date.

| Scenario | Treatment cost | Estimated plan payment | Estimated employee payment |
|---|---:|---:|---:|
| A: all this benefit year | $1,500 | $300 | $1,200 |
| B: fillings now; crown after reset | $1,500 | $775 across two years | $725 |

Illustrative difference: **$475**, conditional on those assumptions. Scenario B's first filling is $90 patient/$160 plan; second is $110/$140; crown is $525/$475. The next year's projected remaining maximum is $325. The $775 total spans two benefit years and must never be shown as this year's usage.

Retire the earlier conversational $3,200/$610 examples: they were not a validated shared fixture. Do not copy them into screenshots or marketing claims.

## 7. Judging: evidence, not promises

The official [Devpost overview](https://codelinc11.devpost.com/) lists ten criteria. This is our evidence plan, not a declaration that judges have passed the product.

| Criterion | What we demonstrate | Proof / task gates |
|---|---|---|
| User Interface & Intuitiveness | Readable phone results, editable facts, accessible explanation | UI-G1 through UI-G6; T4-01 to T4-08 |
| Functional Requirements & Impact | All three core Dental requirements | CH-01–03; T3-01, T5-04, T8-01 |
| Solution Design & Innovation | Constraint-aware comparison with provenance | T2-04, T5-03; change a real input live |
| Demonstration & Presentation | One coherent human story with a backup | T8-02, T8-03 |
| Does It Work? | Real API, deterministic math, persisted result | T3-04, T7-01, T8-01 |
| Technology Platforms Employed | Purposeful AWS and mobile integration | T0-04, T5-02; deployed version and trace |
| Security Accommodations | Scoped access, private data, protected actions | T3-03, T7-03, T7-04 |
| Technical Creativity | Adaptive missing-data questions and honest what-if analysis | T4-03, T5-03 |
| Architecture & Methodology | Contracts, feature folders, phased acceptance evidence | T1-02, T1-03; system design |
| Complexity | Bounded optimizer; one agent; no redundant infrastructure | T2-04, T7-05 |

Core behavior deserves more effort than custom login. No feature list, stack choice or conceptual score guarantees a prize. Compare results on identical inputs and report only observed test/demo outcomes.

## 8. Demonstration and presentation

Target 4 minutes 30 seconds, leaving buffer within the published five-minute limit unless onsite instructions change.

| Time | What the audience sees | Point to make |
|---|---|---|
| 0:00–0:25 | Maya's confusing estimate | Insurance should be understandable before the bill |
| 0:25–1:05 | Intake and confirmation | We extract or collect only useful facts |
| 1:05–1:40 | One relevant question and actual job events | The agent handles missing information transparently |
| 1:40–2:30 | $1,200 baseline and $725 conditional scenario | The math is testable; the dates are constrained |
| 2:30–3:05 | Tap a number; open its rule and calculation | No unexplained savings figure |
| 3:05–3:40 | Change benefit usage or fix the crown date | The answer changes; the recommendation is not hard-coded |
| 3:40–4:10 | Save and view ledger; real reminder if ready | User control and a verifiable next step |
| 4:10–4:30 | Architecture and limitations | AI interprets; code calculates; clinicians determine timing |

Use a physical phone mirrored to the projector. A branded animation can introduce the story but must not replace a functioning demonstration. Label synthetic inputs, cached results and recorded fallback clearly.

Pitch: “ActionBridge Dental brings clarity before treatment. Our mobile benefits agent turns a dental estimate and plan rules into an auditable cost breakdown and dentist-constrained scheduling options, so employees can understand the tradeoffs and decide what to confirm next.”

## 9. Rules and clarification register

The opening deck describes the Dental tasks and AWS pathway. The published web requirements mention mobile submissions, challenge-period development, source/description/demo, and rights/licensing responsibilities. Onsite guidance may clarify older generic language; record its issuer, time and exact decision. [Overview](https://codelinc11.devpost.com/) · [Rules](https://codelinc11.devpost.com/rules).

| Question | Current treatment |
|---|---|
| May the pre-event starter and mobile designs be reused? | Unresolved. Obtain explicit organizer confirmation before copying them into the competition entry |
| Must specific AWS services be used? | Runtime is our selected target; distinguish the deck's recommended pathway from a confirmed mandate |
| Can we demonstrate labeled fictional plans/quotes? | Ask mentor; use only authorized sample material |
| Does FAIR Health have an event-authorized feed/license? | Unknown; no assumed API or scraping permission |
| Is mobile or web acceptable onsite? | User reports either is accepted; mobile remains our deliberate choice; record clarification |
| What is the cutoff? | Deck and web times differ; target readiness by 10:00 a.m. Eastern October 4, confirm official submission/presentation time |

Do not use Lincoln logos without permission. Attribute third-party assets and disclose future licensing costs. Keep actual patient data out of the hackathon demonstration.
