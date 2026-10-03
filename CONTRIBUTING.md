# Team guide — adding the mobile UI

For teammates joining the build. Read this first, then [mobile/README.md](mobile/README.md). Product rules and the full plan are in [docs/](docs/README.md).

## 1. What already works

| Part | Status |
|---|---|
| Benefits engine (`packages/benefits-engine`) | Tested; the $1,200 vs $725 fixture is the regression test |
| Live API on AWS (Ohio) | Cases, estimates, scenarios, insured vs self-pay, save strategy, ledger — behind Cognito login |
| Mobile foundation (`mobile/`) | Sign-in, typed API client, theme and UI primitives, two **placeholder** screens to replace |

You do **not** need AWS access to build the UI. You only need a demo login (ask the account owner).

## 2. One-time setup

Prerequisites: Git, **Node 22.13 or newer**, and the **Expo Go** app on your phone (it must support Expo SDK 57).

```bash
git pull
git switch feat/phase0-1-contracts-engine      # the team's current base branch
npm run setup                                  # root install + build shared contracts + mobile install
cp mobile/.env.example mobile/.env             # public API values, not secrets (Windows: Copy-Item)
```

Run the app:

```bash
cd mobile
npm start                                      # rebuilds the shared contracts, then starts Expo
```

Scan the QR code with Expo Go. If the phone can't connect (venue Wi-Fi often blocks it), use `npx expo start --tunnel` after a first `npm start`.

Sign in with your demo login. The first sign-in asks you to choose a new password. Then tap **Run the sample**: you should see **$1,200.00** and **$725.00** calculated by the live API. If you see that, your setup is complete.

## 3. Branch workflow

```bash
git switch feat/phase0-1-contracts-engine && git pull
git switch -c feat/mobile-ui                   # one branch per person or feature
# ...work, commit small...
git push -u origin feat/mobile-ui              # then open a pull request into feat/phase0-1-contracts-engine
```

Pull the base branch often (`git pull origin feat/phase0-1-contracts-engine`) and run `npm run setup` again when `package.json`, `package-lock.json` or `packages/contracts` changed.

**Avoid conflicts:** the UI lives in `mobile/src/`. Please don't edit `packages/`, `backend/`, `infra/` or `docs/fixtures/` on a UI branch — ask the backend owner if the API or contracts need to change, so both sides change together.

## 4. Where your UI goes

| Put | In |
|---|---|
| Screens (routes) | `mobile/src/app/` — Expo Router: each file is a screen, `_layout.tsx` defines navigation. Keep route files thin |
| Feature screens and components | `mobile/src/features/<feature>/` (e.g. `intake`, `results`, `strategy`) |
| Shared visual components | `mobile/src/components/` |

Replace the placeholder `src/app/index.tsx` and `src/app/sign-in.tsx` freely. **Keep** these, and build on them:

| Use | For |
|---|---|
| `useApi()` from `src/services/api-context.tsx` | Every backend call (`createCase`, `getCase`, `patchCase`, `estimate`, `scenarios`, `coverageComparison`, `saveStrategy`, `ledger`) |
| `useAuth()` from `src/features/auth/auth-context.tsx` | Signed-in state, email, sign out |
| `src/lib/questions.ts` | Turning the engine's `needs_information` facts into questions and answers into a case update |
| `src/lib/format.ts` | Money and dates (`formatCents`, `parseDollarsToCents`, `formatDate`) |
| `src/theme/*` and `src/components/ui.tsx` | Colors (light/dark), font, spacing, accessible buttons, inputs, badges |
| `newIdempotencyKey()` from `src/lib/idempotency.ts` | One key per Save tap, reused if that tap is retried |

Example:

```tsx
const api = useApi();
const { caseId, caseRevision } = await api.createCase(request);
const estimate = await api.estimate(caseId, caseRevision);
if (estimate.status === 'needs_information') {
  // show questionFor(fact, case) for each estimate.missing fact
} else if (estimate.status === 'estimated') {
  // estimate.totals.patientPaysCents, estimate.lines, estimate.yearProjections ...
}
```

Errors are `ApiError` with `code`, a user-facing `message` and `options.requestId` (show it as a small "Reference" for support).

Add packages only with `npx expo install <package>` (inside `mobile/`) so versions match SDK 57. Expo Go only includes Expo's bundled native modules; anything else needs a development build — check with the team first.

## 5. Product rules the UI must keep

1. Show only amounts returned by the API for the **current** `caseRevision`. After any edit, mark old results "Recalculation needed" until new ones arrive. Never hard-code savings.
2. **Unknown is not $0.** Missing values show as unknown with a way to answer them.
3. Conditional results (e.g. "assumes next year's coverage is unchanged") always show their assumption.
4. The cheapest option is not "best care". Use "lowest estimated cost among the options checked". No urgency or "use it or lose it" pressure.
5. Saving a strategy is not a claim, payment or booking. Sharing is never automatic.
6. Label synthetic data ("Synthetic sample") and never fall back to fake data when the live API fails — show the error and a retry.
7. Accessibility: 44-point touch targets, screen-reader labels, readable contrast in light and dark, meaning never by color alone, respect reduced motion.

## 6. Before you push

```bash
npm run check:mobile          # from the repo root: mobile typecheck + mobile unit tests
cd mobile && npx expo-doctor  # dependency/config check
```

Then open the app on your phone and run your screens against the live API.

## 7. Troubleshooting

| You see | Do this |
|---|---|
| "Configuration needed" screen | `mobile/.env` is missing — copy it from `.env.example`, restart Expo |
| "Shared contracts are not built yet" | From the repo root: `npm run setup` (or `npm run build`) |
| Expo Go says the project needs a different SDK | Update Expo Go from the app store (project is SDK 57) |
| Phone can't load the app | Same Wi-Fi as the laptop, or `npx expo start --tunnel` |
| "Email or password is incorrect" | Ask the account owner to reset your demo login |
| `REVISION_CONFLICT` (409) | The case changed since you loaded it: reload the case, then recalculate |
| `BAD_RESPONSE` | Your contracts are out of date: pull, `npm run setup`, restart Expo |

## 8. For the account owner

Create a login per teammate (prints a one-time temporary password — share it privately, never in Git):

```bash
bash infra/scripts/create-demo-user.sh teammate.demo@example.com
bash infra/scripts/create-demo-user.sh teammate.demo@example.com --reset   # forgotten password
```
