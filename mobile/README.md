# ActionBridge Dental — mobile app

Expo SDK 57 · React Native 0.86 · Expo Router · TypeScript. A separate npm project (own lockfile), not part of the root workspace.

The dental app UI (design v3, `actionbridge-dental-v3/`), built on the foundation services: Cognito sign-in, the typed live API client, theme tokens and accessible primitives. Every amount shown comes from the live API; nothing is simulated.

| Flow | Route (`src/app/`) | Feature folder |
|---|---|---|
| Welcome, Sign in | `welcome`, `sign-in` | `features/auth` (hero image slot: `welcome-image.ts`) |
| Home, My plan, Activity, Profile (tabs) | `(app)/(tabs)/…` | `features/home`, `features/activity`, `features/profile` |
| Describe your situation → assistant (confirm what it understood → grouped questions → result / questions to ask) | `(app)/case/describe`, `case/[caseId]/assistant` | `features/assistant` |
| New estimate (typed) → questions → coverage rules | `(app)/case/new`, `case/[caseId]/questions`, `…/rules` | `features/intake`, `features/case` |
| Check your details → update a detail | `case/[caseId]/facts`, `…/edit` | `features/case` |
| Your options → self-pay quotes | `case/[caseId]/options`, `…/self-pay` | `features/options` |
| Plan details → sources | `case/[caseId]/plan`, `…/sources` | `features/plan` |
| Review and save → saved + history | `case/[caseId]/review`, `…/saved` | `features/saved` |

Not built yet, because their backend does not exist: voice, document upload and camera, reminders, and data deletion. Home shows those inputs as "Coming soon".

Ready for the next backend features:
- `src/lib/capabilities.ts` switches voice, upload and photo on Home once their APIs are deployed.
- `useApi()` already has typed agent-job calls (`createJob`, `getJob`, `answerJob`, `retryJob`, `cancelJob`) validated against `@actionbridge/contracts`.
- `questionFromBlock()` in `src/lib/questions.ts` renders agent `missing_field` questions with the same question card as engine questions.

## Run on a phone (Expo Go)

```bash
npm --prefix .. run build      # once, and after any change to packages/contracts
cd mobile
npm ci
cp .env.example .env           # values are the deployed stack outputs (public, not secrets)
npx expo start                 # scan the QR code with Expo Go; add --tunnel if the venue Wi-Fi blocks LAN
```

Sign in with a demo account. To create one for yourself (synthetic data only), from the repo root:

```bash
aws cognito-idp admin-create-user --user-pool-id us-east-2_in8mqQVUv --username you@example.com \
  --message-action SUPPRESS --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --profile actionbridge --region us-east-2
aws cognito-idp admin-set-user-password --user-pool-id us-east-2_in8mqQVUv --username you@example.com \
  --password '<12+ chars, upper, lower, number>' --permanent --profile actionbridge --region us-east-2
```

## What to reuse when adding the team UI

| Module | Use it for |
|---|---|
| `src/services/api-context.tsx` → `useApi()` | `createCase`, `getCase`, `patchCase`, `estimate`, `scenarios`, `coverageComparison`, `saveStrategy`, `ledger`. Responses are validated against `@actionbridge/contracts`; failures are `ApiError` with `code`, user-facing `message` and `options.requestId` |
| `src/lib/idempotency.ts` → `newIdempotencyKey()` | Create one key when the user taps Save and reuse it for retries of that tap: `saveStrategy(caseId, { scenarioId, expectedRevision, consent: true }, key)`. A replay returns `replayed: true` with the same strategy |
| `src/features/auth/auth-context.tsx` → `useAuth()` | `status`, `email`, `signIn`, `signOut`. Tokens refresh automatically; the refresh token is kept in SecureStore |
| `src/lib/questions.ts` | Adaptive loop, typed path: `questionFor(missingFact, case)` picks the control; `changesForAnswer(case, fieldPath, value)` builds the PATCH |
| `src/lib/format.ts` | `formatCents`, `parseDollarsToCents` (exact cents; never round display values back into the engine), `formatDate`, `formatBps` |
| `src/theme/tokens.ts`, `src/theme/theme.tsx` | Palette (light/dark), fonts, spacing, `useTheme()` incl. `reduceMotion` |
| `src/components/ui.tsx` | `Screen`, `Card`, `AppText`, `Button`, `Badge`, `Notice`, `TextField`, `MoneyField` (with "I don't know"), `ChoiceChips`, `Row` |
| `src/features/intake/sample-case.ts` | The shared synthetic fixture, read from `docs/fixtures` — always label it "Synthetic sample" |

Rules that the UI must keep (docs 04 and 05): display only engine results for the current `caseRevision`; mark old results stale after any edit; unknown values stay unknown (never shown as $0); conditional results carry their assumption; no mock fallback in live mode.

## Checks

```bash
npx tsc --noEmit                                      # typecheck
npx expo-doctor                                       # 21/21 on 2026-10-03
npx expo export --platform android --output-dir dist-check   # bundle validation, not an installable build
npx vitest run mobile                                 # from repo root: unit tests for lib, API and Cognito clients
```

`LICENSE` was added by the Expo project template (Expo's MIT notice). The team should decide the project's own license before submission.
