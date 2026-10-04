# ActionBridge Dental — Working desktop web mockup

Corrected prompt, revision 2. This replaces the previous web-design prompt. Attach the mobile screens only as visual references. Paste the text between BEGIN PROMPT and END PROMPT into Claude Design.

## BEGIN PROMPT

**Build a complete, working desktop web application mockup for ActionBridge Dental.** Build the actual frontend pages and connect them so I can use the browser preview like real software: log in, navigate, enter information, select options, review results, open details and save a plan.

The attached mobile screens are **visual references only**. Use their colors, branding, typography and component character to create the desktop web version. The output must be a functioning interactive frontend—not mobile screens, screenshots, a storyboard, a collection of design boards, a marketing landing page or a written proposal.

**No backend is required.** Use fictional sample data, local frontend state and simulated service responses. Do not connect AWS, Cognito, a database, external authentication, AI, OCR, transcription, email or an insurance API. Do not ask me for API keys or infrastructure setup. The preview must work immediately.

Use React with reusable components and local state if available, or the HTML/CSS/JavaScript artifact format supported by this environment. Create real controls and connected pages, not images of controls. Preserve the mobile references and build the web mockup as a separate artifact.

### 1. Product and visual direction

ActionBridge Dental helps a person understand dental treatment costs and existing insurance benefits, answer missing questions, compare treatment timing and save a clear plan. This mockup demonstrates that workflow with sample data. It does not diagnose dental conditions, verify insurance, book treatment or submit claims.

Preserve the existing ActionBridge logo, with Dental as a restrained descriptor, the signature green orb, rounded cards, clean typography and consistent outline icons. Use the latest dental mobile references for visual direction. Older assistance/rent screens are appearance references only; do not retain their program/referral content.

Established palette:

- Dark background `#07110D`; dark surface `#101C17`.
- Bright emerald `#31E981`; deep green `#0E6B4D`.
- Light background `#F5F7F2`; white cards `#FFFFFF`.
- Dark text `#101512`; light text `#F4F8F5`.
- Preserve the reference muted/border colors. Amber and red serve meaningful warning/error states only.

Use the reference font, with Plus Jakarta Sans as the established fallback, and Lucide-style outline icons. Keep 16px reading text, clear headings, tabular money figures, generous spacing, subtle borders and roughly 16–24px card radii. Avoid unrelated colors, emoji icons, heavy shadows and generic dashboard statistics.

Preserve dark visual treatment for login, intake and agent work, and light treatment for financial comparison and detailed reading. The orb should feel refined and purposeful, not dominate every screen.

### 2. Proper desktop application layout

Primary viewport: 1440 × 900. Also make 1280 × 800 and 1024px widths usable. Use the browser width naturally. Do not put the application in a phone frame or stretch a narrow mobile column across the page.

After login, show a left sidebar around 232px wide with **Home, My plan, Activity, Profile**, an active-state highlight, and account/sign-out controls. Add a restrained top header with the current page title and user name. No bottom navigation on desktop.

Use about 24–32px content padding, side-by-side comparison cards, readable financial tables and a contextual evidence panel. Intake may show the current task on the left and supporting documents/facts on the right. Collapse supporting panels into drawers on smaller laptops rather than squeezing three columns together. Use normal scrolling and never hide content behind sticky actions.

Narrow-browser layouts should remain usable, but the primary result must look like a polished desktop web application. No fake revenue charts, clinic-management menus or unrelated metric tiles.

### 3. Login page: working form, no external redirect

Make the initial page a complete login view. Use a two-column composition: a calm dental-room image on the left and the actual login form on the right. The image should show an inviting modern dental chair, soft daylight and neutral/green materials. Use a permitted image or finished vector illustration; avoid broken images, empty placeholders, intimidating instruments and unauthorized insurer logos.

Include the brand, **“Welcome to ActionBridge Dental”**, and **“Understand your dental costs. Plan your next step.”**

The form has labeled Email and Password fields, Show/hide password, Forgot password, a full-width Sign in button and a Create account link. Include **Fill demo credentials**, using `jordan@example.com` and `DentalDemo123!`.

Required interactions:

- Empty or invalid fields show clear inline errors.
- Fill demo credentials populates the fields.
- Valid demo credentials trigger a brief loading state, set a local demo session and open Home.
- Invalid demo credentials show an error.
- Pressing Enter submits the form.
- Create account opens a local mock name/email/password-confirmation form; completion enters the app using that display name without creating a real account.
- Forgot password opens an email form and then **“Demo reset confirmation. No email was sent.”**
- Sign out returns to Login.

This is a simulated login, not real security. Do not store or log passwords. Do not redirect to Cognito or introduce an additional sign-in page outside the mockup. Keep a small **Demo mode · Sample data** label throughout the experience.

### 4. Home page

Heading: **“Let's make sense of your dental costs.”** Supporting line: **“Tell us about your treatment or add an estimate. We'll ask only for what's missing.”**

Create a balanced desktop composition with the orb and prominent input card. Provide working **Speak, Upload document, Take a photo, Type** entry points. Each opens its own interaction. Add **Try a sample case**, and show **Continue your plan** after local progress exists.

Do not fill the empty account with fabricated personal benefits. Show a welcoming empty state until the sample case begins.

### 5. Intake: usable frontend simulations

**Speak:** open a view labeled **Sample voice interaction** with an animated orb, timer, Stop and Cancel. Stop shows brief simulated processing and then an editable sample transcript: “I need two fillings and a crown. Can you help me understand what my plan covers?” Confirming it updates the local case. No actual microphone or transcription is required. Spoken agent responses are outside this mockup.

**Upload document:** use a real local file picker and drag-and-drop, showing filename and a local thumbnail when practical. Files never leave the browser. Include **Use sample estimate** so the demo does not depend on an external file. Provide remove/replace controls. For arbitrary files, explicitly say the analysis uses sample content; never claim the mockup extracted their actual document.

**Take a photo:** open a simulated camera view with a sample document and working Capture, Retake and Use photo controls. Label it **Sample camera preview**. Use photo attaches the sample image to the current case. Real camera access is not required.

**Type:** open a working text area and retain entered text. Explain that this mockup demonstrates sample analysis rather than analyzing arbitrary treatment details.

Let users add a sample voice note after uploading/capturing a document. All inputs converge on the same review screen and preserve the case. Cancelling one recording or removing one file must not erase other valid input. Include simulated unavailable/permission-denied states in a secondary Demo controls menu.

### 6. Fact review and generative UI

Show sample procedures, plan information, timing constraints and source labels in editable cards. Implement focused questions using local branching rules and reusable components:

| Missing information | Component |
|---|---|
| Insurance status | Insured / Self-pay / Not sure choices |
| Network status | In network / Out of network / Not sure |
| Benefits already used | Currency input, Use sample amount, simulated voice answer, Add evidence |
| Relevant date | Accessible date picker |
| Conflicting facts | Source-linked choices and Edit / I don't know |
| Missing document | Choose file / Sample photo / I don't have it |

Every question includes a short **Why we ask** explanation. Selected answers visibly update state. Do not advance with invalid required inputs or ask again for a confirmed fact. Unknown required answers show an incomplete-information state and useful recovery, not an endless question loop.

The primary sample question asks how much the insurer has already paid this year. **Use sample amount** fills `$500` with a Sample label. A simulated voice answer leads to the same amount for confirmation. The journey should be completable through choices without mandatory free-text typing.

Before comparison show **“Here is what we'll use”** with working Confirm/Edit controls. Critical edits invalidate old results. Only support the sample calculations below; for unsupported edits show **Restore sample values** or an unavailable state rather than pretending stale totals were recalculated.

### 7. Agent working page

Use the dark design, orb and concise timeline. Run a short local timed sequence for reading sample information, identifying procedures, checking missing details, preparing sample calculations and comparing schedules. Pause for a required question and continue after confirmation.

Provide **Skip preview** for repeat demonstrations, Cancel, and **Continue in background** that returns Home while local progress completes. Stop timers appropriately on reset/unmount. All actions should preserve the correct current case state.

Keep the Demo mode label visible. Show observable task summaries, not invented private reasoning. Include a selectable simulated failure with a working Retry action.

### 8. Your dental options page

Make this the strongest desktop page: light reading surface, excellent hierarchy, aligned money figures and two equal side-by-side cards: **All treatment this year** and **Split across benefit years**.

Each card shows the same procedure scope, estimated patient cost, insurer contribution, dates and relevant assumptions. Selecting a card changes the active selection and the downstream review summary. Add a visible, conditional estimated difference, not an unsupported “best” badge.

Below, show a procedure breakdown table, separate benefit-year bars and an expandable **What could change this estimate?** section. Source buttons open an evidence panel without resetting the selected scenario.

Include **Using my plan / Self-pay** controls. Initially self-pay displays **Add a self-pay quote**, never $0. Let users add a positive cash quote for the same three procedures, and provide an explicitly labeled **Use sample quote: $1,500** action. Compare it to the fixed supported insured result with simple local arithmetic. Handle cash being cheaper honestly. This is a treatment-cost comparison, not net savings from buying insurance.

**Review this plan** opens review; **View details** opens the selected plan's details. Both work and preserve the choice.

### 9. Details and evidence page

Show a concise summary, treatment timeline, expandable per-procedure costs and separate benefit-year usage. Clicking a cost row expands it. Source links reveal embedded fictional document excerpts clearly labeled Sample evidence. Do not make up claims of real verification.

Use **From sample document**, **Provided by you**, **Needs confirmation**, **Assumed for comparison** and **Estimated** labels. Keep important conditions visible: future coverage is assumed, and timing changes require a dentist-provided window. The app never decides that care can safely wait.

Distinguish reported insurer-paid usage from projected selected-plan usage. Comparing/saving a plan does not consume benefits. Do not merge multiple years' annual maximums into one balance.

### 10. Review, save and success

Review displays the selected dates, costs, assumptions and an Edit selection action. **Save this plan** updates local state, shows a short saving state and then **Your plan is saved**. Repeated taps create only one logical saved plan.

Saving immediately updates **My plan** and **Activity**. It does not book treatment, submit a claim, send a referral or contact anyone. A next-action card provides a sample question for the dentist. **Copy question** should copy when supported or show selectable text as a fallback.

If you include a reminder, save a local demo reminder only and label it simulated. Do not claim a real notification is scheduled. Keep success visually refined rather than covering the page with confetti.

### 11. My plan, Activity and Profile

**My plan:** useful empty state before saving; the correct chosen plan afterwards. Open details, edit/recompare and resume must work.

**Activity:** show events generated by actual mock interactions, such as sample document added, details confirmed, options compared and plan saved. Expandable entries display their context and timestamps. Avoid events that contradict what the user did.

**Profile:** display the demo name/email, allow local name editing, explain demo-data behavior, and provide Sign out and Reset demo. No dead menu items or unrelated administrative settings.

**Reset demo** clears the fictional case state, cancels active simulated jobs and returns the app to a predictable initial state. LocalStorage may retain fictional plan data using a versioned key; use memory if storage is blocked. Never persist passwords, raw files or audio. A secondary Demo controls menu can expose empty, incomplete, failure/retry and expired-session examples without dominating normal navigation.

### 12. Consistent sample data

Use Jordan and this fictional case everywhere. These are not actual Lincoln policy terms or clinical advice.

- 2026 annual insurer maximum: $800; previously paid: $500; remaining benefit: $300; remaining deductible: $50.
- 2027 maximum: $800; prior usage: $0; deductible: $50. Same future coverage is explicitly assumed.
- Two fillings cost $250 each, with an insurer rate of 80% after deductible.
- Crown costs $1,000, with an insurer rate of 50% after deductible.
- All covered and in network; billed equals allowed for the fixture; no other limits apply.
- Fillings: November 10 and 11, 2026. Crown: November 12, 2026 or January 10, 2027 within a fictional dentist-supplied window.

| Scenario | Insurer contribution for these treatments | Estimated patient cost |
|---|---:|---:|
| All in 2026 | $300 | $1,200 |
| Crown in January 2027 | $775 across both years | $725 |

The conditional difference is $475. Filling patient costs are $90 and $110. Crown patient cost is $1,000 in the first scenario and $525 in the second.

For the split plan, 2026 shows $500 reported + $300 projected and $0 remaining after projection. 2027 shows $475 projected and $325 remaining. Never show the combined $775 as one year's paid usage.

The optional sample self-pay quote is $1,500 for identical procedures. Its difference from the immediate insured estimate is $300 and from the split estimate is $775. Keep these distinct from the $475 timing difference, and disclose differences in treatment dates. Use simple local arithmetic for a user-edited cash quote; do not build the full benefits engine.

### 13. Frontend quality and interaction requirements

Use real DOM controls, responsive layouts and a consistent router or page-state system. Sidebar links, in-app Back, tabs, forms, dropdowns, modals, drawers and disclosure rows must work. Support browser Back/Forward when the environment supports navigation without breaking the preview. Avoid unnecessary page reloads.

Include readable labels, inline validation, visible keyboard focus, accessible dialogs, logical headings, contrast and reduced motion. Do not hide essential actions behind hover. Ordinary transitions should be restrained. Keep financial figures readable, tables unclipped and sticky actions clear of content.

Keep fixtures and mock functions separate from components so real services can replace them later. Future integration is not part of this task. Do not set up AWS, Expo or production authentication merely to create the mockup.

All requested core pages should be complete and visually consistent. No “coming soon” replacement for essential pages, broken image placeholders, empty giant panels, dead navigation or generic buttons that do nothing.

### 14. Verify the working journey and deliver it

Operate the frontend before finishing:

1. Login appears first; invalid fields show errors; demo sign-in opens Home.
2. Create account and reset-password simulation work; Sign out returns to Login.
3. Each input method opens its appropriate interaction and can be cancelled.
4. Sample intake flows through fact review, a focused question and simulated processing.
5. Choices and simulated voice answers change local state.
6. Scenario selection changes the review and saved plan consistently.
7. Details, evidence and cost rows open and close properly.
8. Saving updates My plan and Activity once.
9. Retry, reset, empty state, unknown answers and back navigation recover sensibly.
10. Desktop layouts are polished at 1440px and 1280px, with usable smaller widths.

If a check cannot be performed in this environment, report that specifically. Do not claim an untested interaction works.

**Deliver the running interactive web preview as the primary result.** Briefly provide demo credentials and any actual limitations. Do not end with only a design proposal, written documentation, screenshots or an architecture plan.

**Build the desktop web mockup now. The mobile attachments establish visual identity; the deliverable is a complete desktop frontend experience with simulated data and no backend.**

## END PROMPT

Reference checked October 3, 2026: [MDN client-side form validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation). Browser validation supports the mock form interaction; it is not actual authentication or a security boundary. This corrected prompt deliberately removes the earlier managed-login handoff and static design-deliverable ambiguity.
