# ActionBridge Dental — mobile foundation

Expo SDK 57 · React Native 0.86 · Expo Router · TypeScript. A separate npm project (own lockfile), not part of the root workspace.

This is the **foundation** for the team's UI: configuration, Cognito sign-in, a typed live API client, theme tokens and accessible primitives, plus two placeholder screens (sign-in and a live connection check). Replace the screens; keep the services.

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
| `src/services/api-context.tsx` → `useApi()` | `createCase`, `getCase`, `patchCase`, `estimate`, `scenarios`, `coverageComparison`. Responses are validated against `@actionbridge/contracts`; failures are `ApiError` with `code`, user-facing `message` and `options.requestId` |
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
