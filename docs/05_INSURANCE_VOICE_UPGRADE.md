# ActionBridge Dental — Focused insurance and voice upgrade

October 3, 2026 · Revision 1.1: adaptive responses, camera and voice-first input integration · Implementation status: not verified

Place this file in `docs/05_INSURANCE_VOICE_UPGRADE.md`. Keep `02_BUILD_PLAN.md` as the main checklist; use the U-task checklist below for these additions. This document changes selected priorities and contracts; it does not restart Phases 1–2 or mark implementation complete. The team reports starting those phases; its latest code has not been inspected here.

## 1. Decision and product promise

Keep the current-plan dental optimizer. Add a clear insured/self-pay comparison and a review experience that shows where each number came from, what remains uncertain, and what action resolves it. Make voice recognition the first multimodal input integration, supporting both standalone intake and follow-up answers; support document upload and camera capture through the same case workflow. Spoken responses remain a later feature.

**Product promise:** “Understand your dental estimate, see what your existing insurance may pay, compare your options, and leave with a clear next step.”

The most valuable problem is the gap between receiving a treatment estimate and knowing what it means for your own coverage, budget and timing. Voice makes this easier to access; reliable calculation and evidence make it useful.

The event identifies Lincoln Financial and AWS. Lincoln appears to be the company intended by “Glencore Financials”; no Glencore partnership was established in this research. Lincoln's existing DentalConnect site already offers a cost estimator and a network dentist finder. Our proposed distinction is the connected workflow across documents, questions, comparison, timing and follow-through—not a claim that cost estimation itself is new. [1–2]

Potential sponsor value is a hypothesis: clearer benefits explanations and better-prepared member questions could reduce confusion and avoidable support contacts. Validate that with a mentor; do not claim measured call reductions, claim savings, integration access, or knowledge of Lincoln's internal architecture.

## 2. Interpret the coach's recommendation correctly

Insurance is already central to the existing engine: deductible, insurer payment percentage, annual maximum, remaining benefits, network pricing and benefit-year sequencing. The upgrade exposes those calculations clearly and adds a self-pay branch.

Insurance is not universally required to receive dental care. NIDCR describes options such as dental schools and community health centers for people who need lower-cost care. Avoid claiming that everybody has coverage or that cash treatment is always more expensive. [3]

Three things must remain separate:

| Question | What the app can establish in this MVP |
|---|---|
| Is this the signed-in app user? | Cognito authentication and backend ownership checks |
| What plan information did they supply? | Extracted or manually entered fields, with source and confirmation |
| Does the insurer currently confirm eligibility and payment? | Not established by a card or membership number; requires an authorized insurer process or attributable response |

Do not build insurance enrollment, underwriting, claim adjudication or a universal policy-number lookup. An insurance card can identify a plan; it usually does not provide enough information for the calculation. Even insurer predeterminations have qualifications and are not guarantees of payment. [4]

Skip collection of a full member number in the demo. Use synthetic plan documents and fictional identifiers. If insurer connectivity is later available, put it behind a separate adapter with explicit consent and dated responses.

## 3. The three proposed differentiators

### A. Side-by-side cost explanation

Show “Using my current plan” and “Self-pay quote” for identical procedures and scope. Add “Alternative timing” using the existing optimizer. Each card shows estimated patient cost, price source/date, assumptions and unresolved questions.

The insured card separates provider charge, contractual adjustment, insurer contribution and patient responsibility. The self-pay card uses the dentist's explicit cash quote. Never reuse an insurer's allowed amount as a cash price. If there is no cash quote, display “Self-pay quote needed”; a regional benchmark, when lawfully available, is only a separately labeled reference.

This is a treatment-cost comparison under current coverage, not a total financial comparison of buying insurance. Do not present its difference as net value of insurance; premiums and other plan costs are outside this MVP.

**Independent synthetic example, not Lincoln terms or market prices:**

| Scenario | Inputs | Estimated patient cost |
|---|---|---:|
| Current plan, in network | Charge $1,500; allowed $1,000; contractual adjustment $500; deductible remaining $50; insurer pays 50% after deductible; sufficient annual benefit | $525 |
| Self-pay | Explicit dentist cash quote $1,200 for the same service | $1,200 |

Insurer contribution is `(1000 - 50) × 0.50 = $475`; patient cost is `1500 - 500 - 475 = $525`. Difference from the supplied cash quote is $675. This is not the existing multi-procedure timing fixture and must not replace it.

If the cash quote is lower than the insured patient estimate, show that honestly. Do not advise bypassing insurance or promise that paying cash will count toward a deductible; prompt the user to confirm the provider's billing rules and their plan's treatment of the payment.

### B. Coverage review with an actionable next step

This is the strongest proposed distinction. Before displaying a confident-looking total, check for missing, contradictory or inapplicable inputs: unknown network status, mismatched plan year, unconfirmed remaining benefits, waiting periods, unsupported exclusions, and discrepancies between the treatment quote and benefit document.

Show specific findings rather than a made-up confidence percentage:

- “The plan summary gives the annual maximum. We still need benefits already paid this year.”
- “Your note says the dentist is in network; the uploaded estimate does not confirm that.”
- “Next year's coverage is an assumption. Confirm it before relying on this timing option.”

Generate the smallest useful question. Where a missing fact affects the calculation, block the definitive result or show explicitly conditional scenarios. Preserve conflicts until the user reviews them; spoken statements must not silently overwrite plan terms.

An evidence drawer shows the field, source page/section or transcript span, document date, and separate user-confirmation status. “Reviewed by you” is not “Verified by insurer.” Do not invent page references or quotations.

Offer a “Questions for my dentist/insurer” card assembled from unresolved items. It can be copied. Export/share is optional, previewed by the user, and must not be described as a delivered referral. Formal predetermination requests remain a future authorized workflow.

### C. Upload, then explain by voice

Example: “Here is my estimate. I can spend about $600 this month. My dentist said the crown could be done in January.”

The user attaches a supported document, records a short note, reviews the transcript, and confirms extracted fields. Attachments and voice belong to the same case and produce one review screen. Voice can add budget and preferences; dentist timing supplied through the user is labeled user-reported, not independently confirmed.

Use press-to-record, stop, review and submit. No always-on microphone, real-time conversational audio, or spoken response synthesis is needed for the first release. Typed entry remains available at every step. The previous starter voice interaction was a mock; this feature is complete only after a real recording transcribes on a physical phone.

## 4. Mobile presentation requirements

Keep the existing palette, typography and component conventions. These additions should improve the current screens rather than introduce another visual system.

| Existing area | Upgrade | Acceptance evidence |
|---|---|---|
| Intake | Four available options: speak, upload, take a photo, type; allow combined input | Denied microphone/camera permission has a usable alternative |
| Agent workspace | Actual upload, transcription, extraction and calculation states | Events come from job state; no simulated progress percentages |
| Clarification | One focused question with a reason and source context | Correct input component; unknown remains an option |
| Recommendation | Patient-cost comparison first; detail on demand | Insured/self-pay scope and source labels are readable |
| Details | Evidence drawer and unresolved items | Unsupported/missing data never appears as verified coverage |
| Timeline | Benefits per actual plan year; projected versus reported usage | Never add two annual caps into one “remaining” bar |
| Action ledger | Confirmed fields, saved strategy and actual next action | Saving does not consume benefits or imply a claim was submitted |

Use schema-validated UI blocks such as `cost_comparison`, `coverage_issue`, `source_evidence`, `missing_field` and `next_step`. The server selects data and block types; React renders approved components. No model-generated executable UI code.

Maintain readable text, screen-reader labels, reduced-motion support, 44-point touch targets, keyboard-safe forms, and layouts on the primary demo phone. Confirmation, cancellation, stale results and failures deserve the same visual care as the success screen.

### Adaptive response loop — required behavior

The user should not have to type every answer. The backend identifies missing or conflicting facts needed for the requested calculation. The agent proposes a focused question; validated rules constrain the field, choices and component. Mobile renders that component, and the user responds in an appropriate supported way.

| Information needed | Preferred response interface |
|---|---|
| Whether the user has coverage | Choice cards: insured / self-pay / not sure |
| Network status | In network / out of network / not sure; retain source status |
| Exact amount already paid by insurer | Currency input, spoken amount, or attach/capture evidence; never invented preset amounts |
| Treatment timing | Date picker using supplied constraints; unknown timing must not become a safe-to-delay assumption |
| Conflicting values | Both values with sources; review/correct or leave unresolved |
| A missing document | Upload file, choose existing photo, or take a photo; explain which document helps |
| Extracted facts ready for review | Summary with Confirm / Edit actions |

Every question includes its purpose and a useful “I don't know” route. Do not ask again for a fact already supplied and confirmed at the current revision. Allow optional questions to be skipped; unresolved required facts produce `needs_information` or a clearly conditional estimate. Never trap the user in repeated questions when they cannot provide a fact.

Suggested choices must not invent plan facts, prescribe treatment or steer the user toward a cheaper clinical option. Prefer exact controls to sliders for money and dates. Voice supplements accessible controls; it is never mandatory.

Extend the question contract with `questionId`, `fieldPath`, `inputType`, `options`, `allowedResponseModes`, `required`, `reason`, `sourceRefs` and `expectedRevision`. Only allow registered components and valid option IDs. Submit final validated answers through the existing `POST /v1/jobs/{jobId}/answers` contract. Attachments and transcription jobs retain the question ID, case ID and revision. Reject outdated answers or request review when another edit changes their context.

For a voice answer: record with permission, stop, upload privately, transcribe, then show an editable transcript and structured value for confirmation. Only confirmed, validated values update the case. For a photo answer: request camera permission, preview/retake, submit through the private document pipeline, extract, and review. Restrict this feature to photographs of documents; it does not diagnose teeth from pictures. Support accepted image formats and normalize or reject unsupported ones with an actionable message. Blurry or incomplete photos offer retake/upload/manual recovery.

The agent may extract and check completeness before confirmation. Before the final comparison, show a concise “Here is what I will use” summary with missing facts and assumptions. After confirmation, run the deterministic calculator and return result cards. Any external action requires its own explicit approval; reviewing facts is not permission to send them.

Mobile receives job status, events, questions and result blocks through the existing authenticated job API. Bounded polling is sufficient for the MVP. Display actual stages, persist submitted answers, and recover after background/resume. The phone handles camera, microphone and UI rendering; AWS handles transcription, document extraction, orchestration and storage. All input methods feed one shared case and calculation engine.

## 5. Minimal AWS additions and authentication

Retain the existing API Gateway, Lambda, DynamoDB, SQS, Bedrock/AgentCore and pure TypeScript calculation boundaries. Keep exact cents and basis points; the model extracts and explains, while the deterministic engine calculates.

| Need | Proposed implementation |
|---|---|
| Login | Cognito managed login; public mobile client, authorization code + PKCE, no embedded client secret [5] |
| API access | JWT authorizer checks issuer/audience and required scopes; Lambda derives owner from trusted token claims [6] |
| Document input | Backend issues scoped, short-lived S3 upload permission; private objects; Textract for supported document OCR [7] |
| Voice input | Supported short audio uploaded privately to S3; asynchronous Amazon Transcribe; editable transcript [8] |
| Extraction/explanation | Existing agent job path; structured output validated before case updates |
| Diagnostics | CloudWatch records request IDs, job state, latency and error category without document text, transcripts, tokens or member numbers |

Prefer a tested Expo development build for managed-login redirects and microphone behavior. Keep demo accounts simple; no roles dashboard or social-login feature is needed. Store session secrets in platform secure storage; clear local sensitive state on logout. Login authenticates the app user, not their insurance eligibility.

Ownership must cover case, job, upload, source document and ledger access. A valid token belonging to another user must still be denied. Use synthetic records throughout the hackathon even with login; this design is not a claim of production healthcare compliance.

Uploads need MIME/size limits, private storage and retention/deletion rules. Treat document/transcript content as untrusted data, never instructions to the agent. Record consent before upload. Raw audio should expire under an explicit short retention policy; user deletion must cover source objects and derived data, not just a DynamoDB TTL flag.

Batch transcription and OCR avoid tying up an HTTP request. Bound worker retries and job duration; use queued status checks or completion events rather than holding a Lambda invocation open indefinitely. Check chosen Region access and recording format before committing to the demo path.

## 6. Small contract changes, no architecture rewrite

- Add `coverageMode: insured | self_pay | unknown` to the case. This describes current coverage, not a purchase recommendation.
- Add per-procedure `selfPayQuoteCents`, quote date/source and explicit included-service scope. Unknown is absent, never zero. Self-pay estimates do not require invented policy fields.
- Store evidence and confirmation separately: source kind/reference/location/date; user confirmation; insurer verification status/reference/time where actually available. An unsupported “verified” state must fail validation.
- Represent conflicts and unresolved requirements as typed issues with affected fields and blocking severity. Case revision changes invalidate estimates and saved-plan approvals as already specified.
- Extend the existing upload route to supported document/audio kinds; verify uploaded object ownership, actual size and accepted format before processing.
- Extend existing case jobs with `transcribe_audio`; feed the reviewed transcript into `interpret`. Reuse job polling, errors, cancellation and revision handling.
- Extend estimate output with separately labeled comparison results and missing inputs. Never turn an unavailable branch into an apparent zero-cost option.
- Place code in the existing feature folders and shared contracts. Add no separate voice backend or second calculation engine.

## 7. Upgrade TODO and release order

Do not mark the existing tasks complete from this document. Each U-task needs an owner, commit and observed test result.

| Task | Priority and existing phase | Work and pass condition |
|---|---|---|
| U-01 | Core; Phase 1 / T1-02 | Add coverage modes, optional cash quotes, evidence and conflict schemas. Reject negative money, unsupported states and fabricated verification |
| U-02 | Core; Phase 2 / T2-03, T2-07 | Add self-pay calculation/comparison. Existing $1,200/$725 timing fixture still passes; independent $525/$1,200 example reconciles |
| U-03 | Core; Phase 3 / T3-03 | Select Cognito as the managed-auth path. Verify login/logout, rejected expired token and denied cross-user reads/writes/uploads |
| U-04 | Core; Phase 4 | Implement cost cards and evidence drawer. Missing cash quote is unavailable; editing input invalidates old comparisons |
| U-05 | Core; Phases 4–5 | Implement the adaptive response loop: missing facts select validated choice/date/currency/review controls; supported voice/attachment answers retain question context. No redundant questions or mandatory free-text for known choices |
| U-06 | Required input scope; Phase 6 / T6-05 | Implement document upload and camera capture using private document processing. Preview/retake, accepted image format, editable extraction, denied permission and unreadable file recovery pass on phone |
| U-07 | First input integration; Phase 6 / T6-07 | Implement actual Amazon Transcribe recognition for standalone intake and follow-up answers. No dependency on U-06 document OCR; reuse secure uploads for audio. Editable transcript, confirmed structured answer, denied permission and timeout recovery pass |
| U-08 | Next; Phase 6 | Create a copyable dentist/insurer question card from actual unresolved issues. No unrequested sending |
| U-09 | Release; Phases 7–8 | Run three complete phone journeys, including one changed input and one failure; preserve real measurements and honest demo labels |

**Today, October 3:** finish the existing engine, connect the typed phone journey to AWS, render the insured comparison/evidence, and save a versioned strategy. Prove a changed input changes the server-calculated result. Target one supported plan and one synthetic patient.

**Input integration order:** start the voice-recognition spike first; it can proceed alongside the engine once case/job contracts and secure audio upload are available. Follow with document upload and camera capture, then verify combined document-plus-voice and follow-up answers. Keep a typed/control-based reference journey for debugging and recovery. Give each integration an initial 45-minute feasibility timebox, not a completion promise. Voice and camera are now requested scope: if blocked, report the limitation and identify the incomplete task rather than silently declaring the requested experience complete. Preserve a working fallback demo while resolving the issue.

**Tomorrow, October 4:** prioritize validation and rehearsal. Retain the existing internal readiness target of 10:00 a.m. Eastern and confirm the official cutoff onsite; published timing is inconsistent. Do not defer the first working app until tomorrow. Web, voice output, insurance shopping, live carrier verification and automatic referrals remain outside this upgrade.

## 8. Added tests and judge evidence

Financial checks: zero versus unknown cash price; cash quote below insured cost; maximum exhausted; deductible satisfied; uncertain network status; scope mismatch; future coverage assumption; rounding and line-total reconciliation. Insured and self-pay comparisons must not modify reported benefits usage.

Interaction checks: standalone voice; upload then voice; photo then choice response; spoken follow-up tied to its question; transcription correction; denied camera/microphone permission; blurry-photo recovery; no redundant questions; unknown required values; conflicting sources; duplicate submit; cancelled/stale job; re-login; background/resume; no-network fallback. Demonstrate one supported journey without keyboard typing, while retaining typing as an option. Test malicious instructions inside a document and cross-user access to the actual S3 source, not just the case route.

| Judging area | Evidence this upgrade can contribute |
|---|---|
| Requirements and impact | Current-plan interpretation and timing remain the primary story; cash comparison expands clarity |
| UI and intuitiveness | An understandable comparison, source drawer and focused input instead of dense insurance text |
| Design, innovation and technical creativity | A connected voice/document/review workflow with controlled generative UI |
| Functionality and complexity | Deterministic calculations, conflict handling and a live changed-input demonstration |
| Technology and architecture | A small AWS workflow with clear trust boundaries and a reusable engine |
| Security | Working authentication, ownership denial, private uploads and redacted logs |
| Presentation | One patient story with a visible before/after decision and an honest next action |

These are intended evidence, not criteria already passed or a guarantee of winning. Do not claim competitors lack the same features without seeing their projects.

## 9. Suggested demo story

A fictional employee has two fillings and a crown, a confusing estimate and limited benefits remaining. They explain their concern in their own words. ActionBridge identifies the procedures, asks for the one missing benefit value, and shows the source of each number. It compares immediate treatment with the permitted timing alternative. The employee opens the evidence drawer, changes a value, watches a real recalculation, and saves the preferred strategy with a question to confirm with the dentist.

Use the validated original fixture for the timing story: estimated patient cost $1,200 versus $725, a conditional $475 difference. Explain the next-year coverage assumption and dentist-provided timing window. Keep self-pay as a brief secondary view with its own explicit quote. Do not combine unrelated example figures.

Opening line: “The treatment estimate tells you what the dentist plans to do. ActionBridge helps you understand what your benefits mean for that plan—and what to ask before you commit.”

## Sources checked October 3, 2026

1. [Official codeLinc 11 event](https://codelinc11.devpost.com/) — host, judging and submission context.
2. [Lincoln DentalConnect health center](https://ohl.go2dental.com/?cli=lincoln) — existing estimator and dentist finder; public listing is not integration permission.
3. [NIDCR: Finding Dental Care](https://www.nidcr.nih.gov/health-info/finding-dental-care) — care-access resources.
4. [ADA: Pre-Authorizations](https://www.ada.org/resources/practice/dental-insurance/pre-authorizations) — distinctions and limits of benefit estimates.
5. [AWS: Cognito PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html) — mobile public-client auth design.
6. [AWS: API Gateway JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html) — token checks and scope validation.
7. [AWS: Asynchronous Textract](https://docs.aws.amazon.com/textract/latest/dg/async.html) — document processing option.
8. [AWS: Transcribe input and output](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html) — audio processing option.

Research establishes product context and service capabilities. Architecture choices, priorities, test cases and sponsor-value hypotheses above are recommendations for this project. No live insurer integration or actual plan-specific pricing was obtained in this research.
