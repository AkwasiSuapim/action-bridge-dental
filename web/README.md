# ActionBridge Dental web

Responsive React + TypeScript site for ActionBridge Dental, connected to the same live API as the mobile app. It uses the same sign-in (Cognito), the same calculator results and the same assistant. Nothing in the site simulates data: every amount comes from the server's benefits engine for the exact case revision on screen.

## Run locally

Requires Node 22.13+ and npm. From the repository root:

```powershell
npm.cmd ci
npm.cmd run build          # builds the shared contracts package
cd web
npm.cmd ci
copy .env.example .env.local   # then fill in the three public values (see below)
npm.cmd run dev
```

Open **http://127.0.0.1:5173/** and sign in with an account your team admin created (`infra/scripts/create-demo-user.sh`). A first sign-in asks for a new password.

### Settings (public, not secrets)

| Variable                 | Value                                                           |
| ------------------------ | --------------------------------------------------------------- |
| `VITE_API_BASE_URL`      | Stack output `ApiBaseUrl` (https, includes the stage, no `/v1`) |
| `VITE_COGNITO_CLIENT_ID` | Stack output `UserPoolClientId`                                 |
| `VITE_COGNITO_REGION`    | `us-east-2`                                                     |

These are embedded in the built site. They are the same values as the mobile app's `EXPO_PUBLIC_*` settings. A missing or malformed value shows a configuration error on the sign-in page, never sample data.

The API only accepts browser calls from the origins in the stack's `WebOrigins` parameter (CORS): the Vercel site, `http://localhost:5173` and `http://127.0.0.1:5173`. A new domain must be added there and deployed.

## Journey

Sign in → Home → **composer** (speak, type, attach up to three pages or take a photo — all as a draft) → **Analyse** once → assistant: "Here's what I understood" (each item quotes the words or document it came from) and grouped questions with "I don't know" → facts review (every value labeled with its source) → options (server results) → details → review and save (one idempotency key per Save, safe to retry) → My plan and Activity (server ledger). "Try a sample case" and "Enter details step by step" are also available.

- **Voice:** the browser records WebM/Ogg (Opus) or MP4, uploads it to a private, time-limited S3 slot, and Amazon Transcribe returns words you can edit. The microphone is on only while recording.
- **Documents and photos:** PDF, JPEG or PNG, one page each, up to 5 MB. Files go straight to private storage and are deleted after the server reads them.
- **Sessions:** the access token stays in memory. The refresh token and email are kept in `sessionStorage` (this tab only) so a reload doesn't sign you out. Nothing goes to `localStorage` except the IDs of cases you opened and a display-name preference.

## Code layout

- `src/config.ts`: public settings.
- `src/services/api.ts`: typed API client (every response validated against `@actionbridge/contracts`) and S3 upload.
- `src/services/cognito.ts`: sign-in, first-sign-in password, refresh and revoke.
- `src/state/auth.tsx`: session and the API client.
- `src/state/case-store.tsx`: current case, edits (PATCH with expected revision), results per revision, saved plan.
- `src/state/use-job.ts`: assistant job polling.
- `src/domain/`: pure helpers: edits → PATCH with sources (`edits.ts`), source labels (`provenance.ts`), assistant answers, composer rules, self-pay quotes, the labeled sample case.
- `src/features/`: pages by flow (`intake` composer, `assistant`, `case`, `options`, `plan`, `saved`, `account`).

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd test
```

Browser tests run against a contract-shaped mock of the API and Cognito (`tests/mock-api.ts`). Its amounts come from the real benefits engine, so the site is tested against server-shaped results without touching the live stack. They cover sign-in errors, the first-sign-in password change and session restore, the sample journey with saving once on retry, the composer (words plus a page, analysed once, confirmations with quotes), fact edits saved with sources, self-pay quotes, and layout plus axe accessibility checks at 360, 390, 768, 1024 and 1440 px.

## Deploy (Vercel)

Vercel builds from the **repository root** (`vercel.json`): `npm ci && npm run build:web`, output `web/dist`. In the Vercel project, set the three `VITE_*` variables above under Settings → Environment Variables, then redeploy. Pushes to `main` deploy production; other branches get preview URLs. Preview URLs are not in the API's CORS list unless added to `WebOrigins`.

## Asset attribution

- Login photo (tooth and mirror): shared with the mobile app (`mobile/assets/images/welcome.jpg`), served from `public/assets/welcome.jpg`. Source and license still to be recorded before release.
- Dental room: Ozkan Guner, Unsplash, photo `1643916800611-1302e8d27c38`. `public/assets/dental-room.jpg`.
- Plus Jakarta Sans: `@fontsource/plus-jakarta-sans`, SIL Open Font License.
- Icons: Lucide, ISC license.
