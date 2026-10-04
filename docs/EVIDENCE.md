# What we built, and how we know it works

Every claim here points to something you can try or check. Results are what we observed on 2026-10-04.

**Try it:** https://action-bridge-dental-web.vercel.app · login `demo.judge@example.com` / `DentalDemo2026!` · upload both files in [`docs/demo/`](demo/) · turn on **Voice** in the top bar.

## The challenge, end to end

| What people need | How ActionBridge does it | See it |
|---|---|---|
| **Describe the planned treatment and their current plan** | Speak, type, upload (multi-page PDFs too) or photograph the estimate and plan summary, all as one draft analysed once. A three-step form is also available. | Upload the two demo PDFs → **Analyse** |
| **Understand likely coverage and their own cost** | A plain-language summary read aloud, then line by line: dentist fee, write-off, deductible, plan share, yearly-maximum shortfall and what you pay, each value showing where it came from | Your options → *What this means for you*, *See the cost breakdown*, **Sources** |
| **Sequence care across the plan year** | Compares the original schedule with dates inside the dentist's window, across the benefit-year reset. If next year's terms aren't stated, it asks once whether the plan renews the same way. Dates without a dentist window are never moved. | Demo PDFs: **$1,200** now vs **$725** with the crown in January (save $475) |
| **Track benefits and act before they expire** | "Benefits left this year: $300 of $800, resets January 1", with an opt-in reminder: **Add to Google Calendar**, an Apple/Outlook calendar file, or a real phone notification (with *Send a test reminder* and *Cancel*) | Options, Saved and My plan |

## Ten things we focused on

| Area | What we built | How we checked it |
|---|---|---|
| **Easy to use, for everyone** | One composer for every input; one card at a time (*"Is this right?"*) with the exact quote and a one-line definition; a live progress checklist; a plain-language summary; **voice guidance** that reads key screens aloud, and on the web lets people answer every step by voice | Playwright + axe accessibility checks at 360, 390, 768, 1024 and 1440 px; labeled controls; reduced-motion support |
| **Real impact** | All parts of the dental challenge on live AWS, plus self-pay comparison, saved plans, a ready-made question for the dentist, and reminders | Live checks (`infra/scripts/smoke-aws.sh`); demo PDFs give $1,200 vs $725 three runs in a row |
| **A design you can trust** | "AI reads, the calculator counts, you confirm": the AI proposes facts with quotes verified word for word; a deterministic engine does all the math; nothing is used until the person says yes | [System design](01_SYSTEM_DESIGN.md) · [Decisions D-01 to D-18](DECISIONS.md) |
| **A clear story to show** | A 3-minute walkthrough with fictional documents, a voice script, and an instant fallback (sample case) | [Demo kit](demo/README.md) |
| **It works today** | Deployed on AWS (us-east-2); web on Vercel; mobile on Expo. Real sign-in, real API, saved results that survive a reload | 297 unit and integration tests; 12 browser tests including a fully hands-free voice run; live API, agent and document checks (including a 3-page PDF) |
| **Purposeful use of AWS** | Bedrock (Nova 2 Lite, tool use), Textract (instant and multi-page), Transcribe, Polly (natural voice), Lambda, API Gateway, Cognito, DynamoDB, SQS, S3, CloudWatch, SAM/CloudFormation, IAM | [README: AWS services and what each one does](../README.md#aws-services-and-what-each-one-does) · [`infra/template.yaml`](../infra/template.yaml) |
| **Security and privacy** | Cognito JWT on every route; data scoped to its owner; revision checks (no silent overwrites); one save per tap; private, encrypted uploads via short-lived presigned forms with size and type limits, real file-type check, deleted after reading; CORS limited to our sites; least-privilege IAM per function; no secrets in the apps; contradictory answers refused | Tests: other user's case → 404, stale revision → 409, wrong file type refused by S3 (403), "$60 met on a $50 deductible" refused; prompt-injection case in the [agent evaluation](evals/agent-eval-results.md) |
| **Creative engineering** | A **hands-free voice agent**: reads each step aloud (Amazon Polly), listens, understands yes / not right / options / spoken amounts with fixed rules, confirms aloud and moves on by itself; verified quotes; adaptive questions grouped by impact (at most four at a time); "I don't know" becomes a question for the dentist or insurer | `backend/src/features/agent-jobs/domain/` · `packages/contracts/src/plain-language.ts` · agent evaluation 5/5 |
| **Sound architecture** | Shared contracts first (Zod, used by API, web and mobile); feature folders; ports and adapters; infrastructure as code; every deploy reviewed as a change set; decisions logged | [`packages/contracts`](../packages/contracts) · [build log](02_BUILD_PLAN.md#14-completion-and-change-log) |
| **Depth where it matters** | A bounded schedule optimizer across benefit years; one agent with a bounded tool loop; background jobs with leases, retries and a dead-letter queue; no redundant infrastructure | [`packages/benefits-engine`](../packages/benefits-engine) (pure, deterministic) · job runner and worker |

## Honest limits

- Hands-free answers need a browser with speech recognition (Chrome, Edge, Safari). The phone app reads every step aloud and you tap.
- Built with accessibility in mind and checked automatically; not yet tested with screen-reader users or people with disabilities. That's the next step.
- Supported plan model: deductible, percentage by service type, yearly maximum. Waiting periods, exclusions and frequency limits are detected and reported as "can't estimate yet" rather than guessed.
- Estimates only. The dentist decides timing and the insurer decides final payment.
