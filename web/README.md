# ActionBridge Dental web

Responsive React + TypeScript frontend. The public landing page and sign-in follow `ActionBridge landing page mockups (2)/` (v2 designs); the in-app pages follow `App mockups in progress/ActionBridge Dental Web.dc.html`, with the mobile theme, financial breakdowns, review and saved-plan patterns as references.

**Status:** sign-in is real (the team's Cognito user pool). The pages after sign-in still run on a fictional sample case in the browser and are labelled **Demo mode · Sample data**; connecting them to the live API is the next step.

## Run

Requires Node 22.13+ and npm. From the repository root:

```powershell
npm.cmd ci
npm.cmd run build
cd web
npm.cmd ci
npm.cmd run dev
```

Before `npm run dev`, copy `web/.env.example` to `web/.env` and fill in the Cognito region and client ID (the same public values as `mobile/.env`). Without them the sign-in page says it isn't set up; there is no demo fallback.

Open **http://127.0.0.1:5173/**. On shells without PowerShell's script restriction, `npm` works in place of `npm.cmd`.

Sign in with an account the team created in Cognito. On first sign-in Cognito asks for a new password. Accounts are admin-created (D-10), so **Create an account** and **Forgot password?** explain that the team sets up and resets accounts.

## Included journey

Landing → Sign in (Cognito) → Home → type, local document upload, sample voice or camera → editable fact review → focused missing-information questions → simulated analysis → insured scheduling / self-pay comparison → details and evidence → explicit review and local save → My plan and Activity.

Profile supports editing the display name, sign-out and reset. Demo controls expose permission fallback, analysis failure/retry, incomplete input, empty state and expired-session examples. Browser Back/Forward, dialog Escape/focus handling, keyboard controls, reduced motion and responsive navigation are supported.

## Frontend boundaries

- `src/state/auth.tsx`: Cognito session, using the mobile app's dependency-free client (`mobile/src/features/auth/cognito.ts`). The refresh token and email are kept in `sessionStorage` (a reload keeps you signed in; closing the tab ends the session); the access token stays in memory. Sign-out revokes the refresh token.
- `src/state/session.tsx`: route gate (signed-out visitors see the landing page at `/`, other pages redirect to `/sign-in`), a single sign-out used everywhere, and the sync that ties the demo session to the Cognito session so demo data never outlives it.
- `src/features/landing/`, `src/features/auth/sign-in-page.tsx`, `src/landing.css`: public pages, styled under `.lp` / `.si` only, with the design's breakpoints as media queries.
- `src/components/`: shared controls, shell, accessible dialog, brand, orb, evidence drawer.
- `src/features/`: page components grouped by user flow.
- `src/domain/`: web view models and formatting.
- `src/services/dental-service.ts`: calculation adapter behind `DentalService`. Currently invokes the existing pure engine locally; replace this adapter when adding HTTP requests.
- `src/features/options/use-comparison.ts`: central result-loading boundary. For asynchronous API integration, add pending/error state here and adapt the job completion call in `src/state/job-store.tsx`.
- `src/state/demo-store.tsx`: versioned browser-only case, selection, saved snapshot and activity state. All critical edits invalidate comparison results. Saves are checked against the current revision and are idempotent per selected scenario/revision.
- `src/state/job-store.tsx`: local simulated task lifecycle. Replace with actual job polling/events during integration.

Insured amounts come from `@actionbridge/benefits-engine`, using the shared fictional regression case. The web mockup's January 10 date is estimated explicitly inside the existing dentist window; the shared fixture and optimizer rules are not modified. Reported insurer payments remain separate from projected usage. Unknown amounts remain unknown.

Voice, camera, document interpretation, reminder delivery and evidence documents are **simulated** and labeled accordingly. Files stay in browser memory; they are not uploaded or interpreted. Saved fictional cases, plans, activity and reminders use localStorage, with an in-memory fallback. File contents, previews, descriptions and passwords are not persisted. Sign-out and session expiry clear the local demo state.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd test
```

Browser tests mock Cognito (they never call the real user pool) and cover the landing page, sign-in errors, the new-password step, reload, sign-out with token revocation and session expiry, then the sample journey, all intake methods, stale-result protection, lower cash quotes, duplicate saves, failure/retry, background completion, reset, and layouts at 360, 390, 768, 1024, 1280 and 1440 pixels. Axe checks run on the landing, sign-in and comparison pages. Browser artifacts are under `test-results/` and `playwright-report/` and are ignored by Git.

`npm.cmd run preview` serves the production build locally.

## Deploy

The site is static. It needs two **public** environment variables (not secrets): `VITE_COGNITO_REGION` and `VITE_COGNITO_CLIENT_ID`, set in Vercel under Settings → Environment Variables (then redeploy, since Vite embeds them at build time). Vercel must build from the **repository root**, because the web app uses the shared packages and their `dist/` folders are not committed. One command does it: `npm ci && npm run build:web`, output `web/dist`. `vercel.json` rewrites unknown paths to `index.html` so direct links and reloads work.

On vercel.com: Add New → Project → import the GitHub repo and keep the root directory as the repository root. Build settings come from `vercel.json`. Pushes to the production branch (`main`) deploy the live site; other branches get preview URLs.

Node 22.13 or later is required (`engines` in the root `package.json`). Calling the live API from the browser also needs the site's address in the stack's `WebAllowedOrigins` parameter (CORS, `infra/template.yaml`) and an API URL variable when the in-app pages are connected.

## Asset attribution

- Tooth and mirror photo (landing hero and sign-in): shared with the mobile app (`mobile/assets/images/welcome.jpg`), served from `public/assets/welcome.jpg`. Source and license still to be recorded before release.
- Landing phone screens (`public/assets/landing/`): screenshots of the app from the design files, showing sample data.
- Geist (landing and sign-in): distributed by `@fontsource/geist`, SIL Open Font License. Served locally.
- Plus Jakarta Sans: distributed by `@fontsource/plus-jakarta-sans`, SIL Open Font License. Served locally.
- Icons: Lucide, ISC license.
- Brand and orbital illustration: code-native SVG adapted from the provided web/mobile references.
