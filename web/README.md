# ActionBridge Dental web

Responsive React + TypeScript frontend built from `App mockups in progress/ActionBridge Dental Web.dc.html`, with the mobile theme, financial breakdowns, review and saved-plan patterns as references. The mobile application, backend, infrastructure and shared fixtures are unchanged.

## Run

Requires Node 22.13+ and npm. From the repository root:

```powershell
npm.cmd ci
npm.cmd run build
cd web
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:5173/**. On shells without PowerShell's script restriction, `npm` works in place of `npm.cmd`.

Click **Fill demo credentials**, or enter:

- Email: `jordan@example.com`
- Password: `DentalDemo123!`

Create account and password reset are local simulations. Demo credentials are public sample values, not real account access. Passwords are never persisted. No backend credentials or AWS configuration are required.

## Included journey

Login → Home → type, local document upload, sample voice or camera → editable fact review → focused missing-information questions → simulated analysis → insured scheduling / self-pay comparison → details and evidence → explicit review and local save → My plan and Activity.

Profile supports editing the display name, sign-out and reset. Demo controls expose permission fallback, analysis failure/retry, incomplete input, empty state and expired-session examples. Browser Back/Forward, dialog Escape/focus handling, keyboard controls, reduced motion and responsive navigation are supported.

### Additional interfaces

- **Manual treatment entry** from Home or Type: add/remove up to six procedures, enter separate billed/allowed/write-off amounts, network status and planned dates. Missing values remain unknown; arbitrary notes still use explicitly labeled sample analysis.
- **Coverage editing** from fact review: service percentages, deductible and maximum applicability, current/next benefit periods, maximum, paid balance, deductible and deductible met. Contradictory amounts and overlapping benefit periods are rejected.
- **Focused questions** for missing engine fields, benefit-year dates, deductible conflicts and missing documents. Sample voice answers require explicit acceptance or discard. Demo controls expose the date, conflict and document examples.
- **Case history** in Activity and My plan: each case has its own identity, answers, quote, saved snapshot and reminder. Starting another sample or manual case preserves the previous case; Resume case restores its state. Up to 20 previous cases are kept locally.
- **Sources and saved history** distinguish original sample excerpts from entered/edited answers. Saved details use the snapshot's source labels. Routine history entries can be shown or hidden.
- **Save recovery** is available through Demo controls → Save failure. Retry preserves the option and consent; saves remain unique per case/revision/option. The dentist question follows the saved schedule, including the original-date option.
- **Individual cash quotes** require a price for every procedure and explicit confirmation of equivalent service scope. A genuine quoted $0 is supported; blank is unavailable. The combined quote input remains available.
- **First-sign-in password change** can be previewed on login. It validates the mobile application's password rules and confirmation; it does not store or change a real password.

## Frontend boundaries

- `src/components/`: shared controls, shell, accessible dialog, brand, orb, evidence drawer.
- `src/features/`: page components grouped by user flow.
- `src/domain/`: web view models and formatting.
- `src/domain/case-fields.ts`: field labels, provenance values and the engine-driven missing-information mapping.
- `src/features/intake/case-forms.tsx`: shared treatment, currency and coverage form controls used by manual entry and editing.
- `src/services/dental-service.ts`: calculation adapter behind `DentalService`. Currently invokes the existing pure engine locally; replace this adapter when adding HTTP requests.
- `src/features/options/use-comparison.ts`: central result-loading boundary. For asynchronous API integration, add pending/error state here and adapt the job completion call in `src/state/job-store.tsx`.
- `src/state/demo-store.tsx`: versioned browser-only case, selection, saved snapshot and activity state, with independent archived cases. All critical edits invalidate comparison results. Saves are checked against the current case identity and revision and are idempotent per selected scenario/revision.
- `src/state/job-store.tsx`: local simulated task lifecycle. Replace with actual job polling/events during integration.

Insured amounts come from `@actionbridge/benefits-engine`, using the shared fictional regression case. The web mockup's January 10 date is estimated explicitly inside the existing dentist window; the shared fixture and optimizer rules are not modified. Reported insurer payments remain separate from projected usage. Unknown amounts remain unknown.

Voice, camera, document interpretation, login, reminder delivery and evidence documents are **simulated** and labeled accordingly. Files stay in browser memory; they are not uploaded or interpreted. Saved fictional cases, plans, activity and reminders use localStorage, with an in-memory fallback. File contents, previews, descriptions and passwords are not persisted. Sign-out clears the local demo state.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd test
```

Browser tests cover the sample and manual journeys, case switching/reload, edited coverage, individual quotes and scope validation, authentication/password-change simulations, all intake methods, explicit voice confirmation, stale-result protection, lower cash quotes, duplicate saves, save retry, background completion, extra question types, reset, and layouts at 360, 390, 768, 1024, 1280 and 1440 pixels. Axe checks cover the main journey, manual forms and coverage drawers. Browser artifacts are under `test-results/` and `playwright-report/` and are ignored by Git.

`npm.cmd run preview` serves the production build locally.

## Deploy

The site is static and needs no environment variables or secrets. Vercel must build from the **repository root**, because the web app uses the shared packages and their `dist/` folders are not committed. One command does it: `npm ci && npm run build:web`, output `web/dist`. `vercel.json` rewrites unknown paths to `index.html` so direct links and reloads work.

On vercel.com: Add New → Project → import the GitHub repo and keep the root directory as the repository root. Build settings come from `vercel.json`. Pushes to the production branch (`main`) deploy the live site; other branches get preview URLs.

Node 22.13 or later is required (`engines` in the root `package.json`). When the web app is connected to the live API later, its public settings (API URL, Cognito region and client ID) will be `VITE_*` variables set in Vercel's project settings; they are public values, not secrets.

## Asset attribution

- Login photo (tooth and mirror): shared with the mobile app (`mobile/assets/images/welcome.jpg`), served from `public/assets/welcome.jpg`. Source and license still to be recorded before release.
- Dental room (previous login photo, kept for now): Ozkan Guner, Unsplash, photo `1643916800611-1302e8d27c38`. [Photo source](https://images.unsplash.com/photo-1643916800611-1302e8d27c38). `public/assets/dental-room.jpg`.
- Plus Jakarta Sans: distributed by `@fontsource/plus-jakarta-sans`, SIL Open Font License. Served locally.
- Icons: Lucide, ISC license.
- Brand and orbital illustration: code-native SVG adapted from the provided web/mobile references.
