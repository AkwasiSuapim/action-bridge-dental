# 04 — Mobile experience, generative UI and Expo workflow

ActionBridge Dental · v2.0 · Specification for the next implementation pass. No screens were rewritten by this package.

## 1. Design objective

Make a complicated financial estimate feel understandable without hiding uncertainty. The primary screen must answer: “What might I pay, why, and what do I need to confirm?” Detail comes through progressive disclosure, not an oversized dashboard.

Keep the existing ActionBridge visual identity. The Dental pivot changes content, data, action semantics and some layouts; it is not a reason to recolor the application or replace its navigation framework.

### Tokens verified in the uploaded source

| Role | Existing token |
|---|---|
| Dark background / surface | `#07110D` / `#101C17` |
| Dark accent | `#31E981` |
| Light background / surface | `#F5F7F2` / `#FFFFFF` |
| Light primary | `#0E6B4D` |
| Light/dark text | `#101512` / `#F4F8F5` |
| Typeface / icons | Plus Jakarta Sans / Lucide React Native |
| Spacing / minimum hit area | Existing 4-point scale / 44 points |
| Layout | Existing max-content 680, max-wide 980, tablet breakpoint 700 |

Use existing amber/red semantics only for warnings/errors, with text or icons. Do not introduce a rainbow for network/scenario comparisons. Measure contrast on actual text/background pairs; an existing token is not automatic proof of accessibility.

## 2. Screen migration map

| Existing feature/route | Dental target | Required behavior |
|---|---|---|
| `home`, `(tabs)/index` | Dental home | Start estimate, resume case, labeled sample; one main CTA |
| `intake`, `intake` | Describe recommended treatment | Typed-first; optional quote/plan upload; voice only when actually implemented |
| Existing intake/clarification components | Plan and treatment review | Editable extracted facts, source/confirmation labels, missing critical fields |
| `agent-progress`, `working` | Benefits analysis workspace | Genuine server stages, elapsed time, cancellation/recovery |
| `clarification`, `clarify` | Targeted missing information | Appropriate typed controls, reason for question, “I don't know” |
| `recommendations`, tab `steps` | Your Dental Benefits Strategy | Baseline, alternatives, conditional difference and remaining benefits |
| `recommendations`, `program/[id]` | Scenario detail, target `scenario/[id]` | Itemized costs, timing, evidence; no program eligibility language |
| `recommendations`, `compare` | Compare timing/network | Same procedure scope; explicit different inputs and assumptions |
| `approval`, `review` | Review save/reminder/share | Exact selected strategy revision and action scope |
| `execution`, `executing` | Action progress | Saving/scheduling/export status; not “sending referral” |
| `action-ledger`, `complete/[caseId]` | Saved strategy and Benefits Ledger | Verifiable completion, planned versus paid benefits |
| `activity`, `case/[id]` | Case history | Reopen confirmed facts, current strategy and stale-result warnings |
| `profile`, `privacy` | Settings/privacy | Theme, demo reset, permission state, retention explanation |

Keep route wrappers thin. Rename feature data deliberately; do not merely relabel a `Program` or `ReferralDraft` object and leave its semantics in the backend.

## 3. Screen-level requirements

### A. Home and intake

Headline: “Understand your dental costs before treatment.” Primary CTA: “Start an estimate.” Secondary: “Try a sample” with a persistent synthetic-data badge.

Collect planned procedures and current plan information. Typed input must work without microphone, camera, or upload permissions. Let the user add multiple procedures in editable cards. A document picker is useful before building a full camera scanner. Avoid collecting birth date, Social Security number, detailed medical history or member ID unless strictly necessary; they are not needed for the fictional demonstration.

### B. Confirm what we found

Group treatment, plan and benefit-year balance separately. Show source title/page, proposed value, confirmation state and edit action per critical field. Highlight differences between “coverage rate paid by insurer” and “you pay”; avoid ambiguous percentages.

“Unknown” is a real state. Unknown allowed amount, annual usage or next-year terms must not be silently filled. Explain what can still be estimated and what remains blocked. A user can confirm a transcription without the UI claiming insurer verification.

### C. Agent workspace

Use the existing orb/stage primitives, but drive statuses from actual job events. Suitable stage labels: reading supplied information, checking missing facts, retrieving plan evidence, calculating costs, comparing permitted dates, preparing explanation. Mark stages skipped when inputs make them unnecessary.

No fabricated percent-complete or fixed delay for effect. No raw chain-of-thought. Show useful operational facts such as “Two values need confirmation.” On slow responses, provide elapsed time and keep the user's input safe. After bounded timeout offer retry/manual entry; do not spin indefinitely.

### D. Missing-information card

One focused question or a small coherent group. Example: “How much has your insurer already paid this benefit year?” Supporting text: “This determines how much of your annual maximum remains.” Control: currency input with an “I don't know” option, not a generic chat box.

Network uses single-select `In network / Out of network / Not sure`. Timing asks for information from the dentist, not “Would you like to delay treatment to save money?” Required financial facts cannot be bypassed into an exact result; optional preference questions can be skipped.

### E. Strategy overview

Order of information:

1. Result status: estimate / needs confirmation / incomplete.
2. Estimated employee total for the selected option, plus insurer contribution.
3. Conditional difference from a named baseline, only if comparability checks pass.
4. Key tradeoff: dates, next-year assumption, network change or incomplete source.
5. Two or three scenario cards and a clearly visible baseline.
6. “See calculation and sources” and “Review this strategy.”

No default auto-approval. The cheapest option is not automatically “best care.” Use “lowest estimated cost among evaluated options” only if true. If nothing can be optimized, explain that clearly and retain useful coverage information.

### F. Details and evidence

Use compact vertically stacked sections: summary, procedure costs, timeline, rule evidence, unresolved questions. The numbers stay readable without side-scrolling a desktop table on a phone. Each procedure expands to its arithmetic and plan clause.

Evidence opens a bottom sheet with source title, page/section, applicable passage, value used, source status and correction action. A statement without supporting evidence is labeled user-provided or assumed, not given an invented citation. Avoid arbitrary confidence percentages; use meaningful verification states.

### G. Review, completion and ledger

Separate saving, sharing and reminders into independent user choices. Saving does not authorize sending health information. Share only after a preview of fields; opening a native share sheet does not confirm third-party receipt.

Ledger examples: “Strategy saved,” “Reminder scheduled on this device,” “Reminder canceled,” “Summary prepared for sharing.” Do not reuse “Referral delivered.” Store timestamps and references to real operations. Clearly label any simulated action.

## 4. Data presentation requirements

| View | Required design | Correctness requirement |
|---|---|---|
| Cost summary | Large employee amount, secondary insurer payment, estimate label | Values from one immutable engine result |
| Charge reconciliation | Charge → contractual write-off → insurer payment → employee amount | These components reconcile to billed charge |
| Employee breakdown | Deductible, coinsurance, cap shortfall, balance bill as distinct rows | No double-counted deductible or balance billing |
| Scenario cards | Same labels/order and units across options | Baseline, procedure set and underlying assumptions identified |
| Benefit-year timeline | Explicit boundary, permitted dates, deductible reset | No implied clinical safety or invented Jan 1 reset |
| Annual maximum bar | Reported paid, projected selected strategy, projected remaining | Annual max is insurer payment limit, not patient out-of-pocket cap |
| Source labels | Document/user/assumption with confirmation state | Origin is separate from insurer verification |
| Missing-result state | Explain missing field and offer action | Never show zero cost as an empty-state placeholder |

Amounts should show two decimal places where needed for reconciliation; formatting never changes underlying cents. Use the user's selected currency consistently; MVP supports USD only. Bars start at zero with clear units and text equivalents. Use outlines/hatching/text to distinguish reported and projected usage, not an extra brand color.

For the supplied fixture, show Scenario A $1,200 employee and Scenario B $725 employee, conditional difference $475. Scenario B spans two years: current-year total insurer usage is $800 ($500 reported + $300 projected); next-year projected usage is $475 of $800, leaving $325. Never combine those into one annual maximum bar.

When an input changes, immediately mark the old result “Recalculation needed,” disable saving that revision, preserve it for reference if useful, and replace it only with a matching-revision response. Do not flash an old green savings badge while calculating a new case.

## 5. Generative UI contract

Generative UI means **data-driven selection of trusted components**, not AI-generated executable UI code. The server may propose a question or explanatory block. The app owns navigation, layout, validation, focus, actions and security.

Implement a runtime-validated discriminated union with `schemaVersion`, `caseRevision`, stable block ID, allowed `type`, and constrained props. Suggested registry:

| Type | Role | Constraints |
|---|---|---|
| `money_input` | Remaining deductible/paid benefits | Known field path, min/max, currency, unknown option |
| `single_select` | Network status | Known option IDs, no free-form executable actions |
| `date_window` | Dentist-supplied dates | Explicit source/confirmation; no automatic clinical inference |
| `fact_review` | Confirm extracted terms | Evidence ID and candidate value |
| `cost_summary` | Render an engine result | Result ID, never model-invented authoritative amounts |
| `scenario_comparison` | Display feasible alternatives | Scenario/result IDs in current case/revision |
| `benefits_timeline` | Show approved windows/periods | Validated schedule and year IDs |
| `evidence_list` | Supporting facts and clauses | Authorized source IDs only |
| `notice` | Unknown/conditional/error explanation | Sanitized plain text and allowed severity |

Example question payload, illustrative target contract:

```json
{
  "schemaVersion": 1,
  "caseRevision": 3,
  "blocks": [
    {
      "id": "q-benefits-paid",
      "type": "money_input",
      "fieldPath": "planYears.py-2026.insurerAlreadyPaidCents",
      "label": "How much has your insurer paid this benefit year?",
      "helperText": "Use the current plan balance if available, not the dentist's total charges.",
      "currency": "USD",
      "minimumCents": 0,
      "maximumCents": 80000,
      "allowUnknown": true,
      "requiredFor": ["estimate", "compare"]
    }
  ]
}
```

The numeric maximum above comes from the **fictional confirmed** plan maximum; do not hard-code $800 in the component. Backend validates field path and scope. Invalid JSON, unknown type, out-of-date revision, oversized text/options or unauthorized source fails safely into a typed fallback form/notice. Never evaluate code, render raw model HTML, navigate to arbitrary URLs, or let a UI block authorize saving/sending.

Question generation may select from unresolved contract fields only. Answers use stable question IDs, type-safe values and expected revision. Required unknown values return an incomplete/conditional path. The engine, not the model, decides whether enough information exists.

## 6. UI verification gates

| Gate | Must pass |
|---|---|
| UI-G1 — Data fidelity | Every displayed amount, status and source corresponds to a current backend result; no hard-coded savings |
| UI-G2 — Interaction | Edit, back, cancel, retry, resume and save behave correctly; duplicate taps do not create duplicate work |
| UI-G3 — Accessibility | Readable contrast; minimum 44-point controls; screen-reader labels/order; large font and keyboard do not hide actions |
| UI-G4 — State coverage | Loading, no alternatives, partial/unknown, unsupported, offline, error and completion states are exercised |
| UI-G5 — Mobile layout | Narrow and wide phone widths, safe areas, rotation as supported, long names/large costs; no clipped labels or hidden totals |
| UI-G6 — Honesty and motion | Reduced motion; real stage events; visible estimate/mock labels; no medical/coverage guarantee; conditional comparison clearly flagged |

Automated component tests must cover every allowlisted block, malformed blocks, unknown values, stale revisions, interrupted flow and engine-to-screen formatting. Screenshots document appearance but do not replace physical-device interaction tests. Test VoiceOver/TalkBack where available; record any unavailable device coverage.

## 7. Expo setup for the existing upload

The archive root contains `mobile/`. Do not run a new project generator inside it. Keep `package-lock.json`; this project uses npm, not Bun. The observed package declares Expo 57; the matching [SDK reference](https://docs.expo.dev/versions/v57.0.0/) lists Node 22.13.x minimum, React Native 0.86 and React 19.2.3. Use a compatible stable Node installation and record exact version. Do not upgrade the SDK during the hackathon without a specific blocker and full re-verification.

Install Node from [nodejs.org](https://nodejs.org/en/download) and Git from [git-scm.com](https://git-scm.com/downloads). Install a compatible Expo Go app for an initial smoke test, or prepare a development build early if chosen features require one. Read the uploaded `AGENTS.md` and matching versioned docs before editing Expo APIs.

From the extracted project parent:

```bash
cd mobile
node --version
npm --version
npm ci
npx expo-doctor
npx expo install --check
```

If `.env` does not exist, copy `.env.example` using your editor or Windows PowerShell `Copy-Item .env.example .env`; do not overwrite existing values blindly. Start with the labeled existing mock environment to establish the baseline:

```dotenv
EXPO_PUBLIC_USE_MOCKS=true
EXPO_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/demo
```

These names are actually consumed by the current app. Do not expose credentials in any mobile configuration. `EXPO_PUBLIC_*` values are embedded in the client bundle: [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

Run `npm run start`. Scan the displayed QR code with the compatible client. Phone and laptop must reach the development server; on venue Wi-Fi, client isolation can prevent this. Try an authorized common hotspot or a documented Expo tunnel instead of weakening firewall rules. A tunnel can add latency and has its own connectivity requirements. Fast Refresh helps JS edits but native dependency/config changes can require a new binary.

On Windows, do not plan to run an iOS Simulator locally. Use a physical supported phone; Android is often the fastest independent build path. Choose the device the team can actually test, not an aspirational platform list.

## 8. Commands that exist today versus future work

Current scripts in the uploaded `mobile/package.json`:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci --runInBand
npm run build:native
```

`build:native` currently runs `expo export` for native platforms: it is **bundle validation, not an installable APK/IPA**. `npm run verify` also runs a web export; a successful export does not prove browser or native-device correctness. Keep the existing verify command if convenient, but do not treat its web build as completion of Phase 9.

Record the first baseline failures before any refactor. Use `npx expo install <package>` for chosen Expo/native dependencies so versions match the SDK. Do not install every optional module at once. Read [Expo's documentation index](https://docs.expo.dev/llms.txt) and the version-specific module page for the feature you are implementing.

| Feature | Candidate module, only when selected |
|---|---|
| Documents | `expo-document-picker`; file APIs as actually needed |
| Camera/image input | `expo-camera` or `expo-image-picker`, selected deliberately |
| Real voice | `expo-audio` plus authorized server transcription |
| Local reminder | `expo-notifications` |
| Small session credential | `expo-secure-store` |
| Share/export | `expo-sharing`, optionally a document renderer |
| Custom native development client | `expo-dev-client` |

## 9. Development and installable demo builds

[Development builds](https://docs.expo.dev/develop/development-builds/introduction/) allow native capabilities beyond Expo Go's bundled set. Choose this early if required, because signing/build queues can become a deadline risk. Adding a supported Expo module does not automatically mean it requires a custom build; consult that module's SDK 57 requirements. Android remote push requires a development build, whereas local notifications have a different support path: [notification docs](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

If using EAS, create/sign in to an authorized [Expo account](https://expo.dev/), select the team's project and follow [internal distribution](https://docs.expo.dev/build/internal-distribution/). Set a distinct application ID owned by the team. Suggested `eas.json` contents to add **in a later implementation task**, not present in this ZIP:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

After profile/permission review, an Android preview can be built with `npx eas-cli@latest build --platform android --profile preview`; record the CLI version used. A development profile needs the development client installed and usually a running Metro server; a preview APK is intended to run its bundled JS. Test the actual artifact. EAS account access/build availability and iOS signing/provisioning are separate prerequisites, not automatic because Expo Web works.

Do not generate or edit `ios/`/`android/` directories manually when using configuration/plugins and generated native projects. Do not run a destructive clean/prebuild merely to fix a JS bug. Preserve existing files and review native configuration changes.

## 10. Efficient team workflow and live cutover

1. Mobile works against the same versioned fixture and runtime schemas as backend. Validate the fixture before screen work.
2. Keep route files thin; group screen components/tests by feature. Reuse existing primitives before adding UI dependencies.
3. Implement one screen/state slice, test it and capture a phone screenshot. Do not wait for all pages before testing navigation.
4. Connect the live base URL only after canonical routes exist. Set `EXPO_PUBLIC_USE_MOCKS=false`, reload/rebuild as required by environment embedding, and inspect a real AWS request.
5. Wire `getAccessToken` if authenticated mode is used; the current factory does not do this for you.
6. Verify stale revision, interrupted request and offline behavior. Preserve case input; never quietly switch live mode to fixture results.
7. Keep a stable branch/build for rehearsal and use separate branches for optional work. Avoid broad dependency or formatting changes immediately before presentation.

## 11. Web extension only after mobile success

React Native Web dependencies and web scripts already exist in the source. That enables reuse, not automatic browser parity. After Phase 9 entry conditions pass, `npm run web` starts a development preview and `npm run build:web` exports the bundle. Test desktop layout, keyboard focus, upload/share/notification fallbacks, auth redirects, API CORS and deep-link behavior before publishing.

Use the same components, schemas and backend. At larger widths, show scenario comparison beside evidence; on phones, stack it with a bottom sheet. Do not create a second application, rewrite navigation, or alter the stable phone demo merely to produce a desktop screenshot.
