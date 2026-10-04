# Judging criteria and evidence

How ActionBridge Dental meets each CodeLinc 11 criterion, with something a judge can check for every claim. Results are what we observed on 2026-10-04; nothing here assumes a score.

**Try it:** https://action-bridge-dental-web.vercel.app · login `demo.judge@example.com` / `DentalDemo2026!` · demo documents in [`docs/demo/`](demo/).

## Challenge requirements (Dental)

| Requirement | How we meet it | Check it |
|---|---|---|
| **Describe the planned procedure and current plan** | Speak, type, upload or photograph the estimate and plan summary, all as one draft analysed once. A step-by-step form is also available. | Composer: upload the two demo PDFs and choose Analyse |
| **Explain likely coverage and employee cost** | Line-by-line estimate: dentist fee, write-off, deductible, plan share, annual-maximum shortfall and what you pay, with the source of every value | Options → Procedure breakdown; Details; Sources |
| **Track benefits and remind before they expire** | "Benefits left this year: $300 of $800 — they reset on January 1", with an opt-in reminder: a real phone notification (with "Send a test reminder" and Cancel) or a calendar alert on the web | Options, Saved and My plan → **Remind me before they reset** |
| **Sequence recommended care across the plan year** | Compares the original schedule with alternatives inside the dentist's window, per benefit year with the annual reset. Dates without a dentist window are never moved. | Try a sample case: $1,200 now vs $725 with the crown after the reset |

## The ten criteria

| Criterion | What we built | Evidence |
|---|---|---|
| **User Interface & Intuitiveness** | A plain-language "What this means for you" summary on results, with **Listen** (Amazon Polly) for people who prefer hearing it; one composer for every input; "Is this right?" cards one at a time with the exact quote; one-line definitions of insurance terms; a live progress checklist; consistent web and mobile design | Web Playwright tests with axe accessibility checks at 360, 390, 768, 1024 and 1440 px (10/10); dark and light themes; keyboard and screen-reader labels |
| **Functional Requirements & Impact** | All three Dental requirements end to end on live AWS, plus self-pay comparison, saved plans and a question to take to the dentist | Live smoke checks (`infra/scripts/smoke-aws.sh`); reference case $1,200 vs $725 (a $475 difference for the same care) |
| **Solution Design & Innovation** | "AI reads, calculator counts, you confirm": the AI proposes facts with verified quotes; a deterministic engine does all math; the person confirms each fact | [System design](01_SYSTEM_DESIGN.md); [decisions D-01 to D-18](DECISIONS.md) |
| **Demonstration & Presentation** | A 3-minute walkthrough with fictional documents, a voice script and an instant fallback (sample case) | [Demo kit](demo/README.md) |
| **Does It Work?** | Deployed on AWS (us-east-2); web on Vercel; mobile on Expo. Real sign-in, real API, persisted results. | 284 unit/integration tests; live checks for the API (13), agent (6) and documents including a 3-page PDF (11) |
| **Technology Platforms Employed** | Amazon Bedrock (Nova 2 Lite, tool use), Textract (sync + async), Transcribe, Polly (read aloud), Lambda, API Gateway, Cognito, DynamoDB, SQS, S3, CloudWatch, SAM/CloudFormation, IAM; Expo; Vercel | [README: AWS services and what each one does](../README.md#aws-services-and-what-each-one-does); [`infra/template.yaml`](../infra/template.yaml) |
| **Security Accommodations** | Cognito JWT on every route; owner-scoped data; revision checks (409 on stale writes); idempotent saves; private encrypted uploads via presigned forms with size and type limits, deleted after reading; real file-type check by first bytes; CORS limited to our origins; least-privilege IAM per function; no secrets in the apps; prompt-injection test | Tests: other user's case → 404, stale revision → 409, wrong file type refused by S3 (403); [agent evaluation](evals/agent-eval-results.md) |
| **Technical Creativity** | Verified quotes (each AI value must appear word for word in the source); adaptive questions grouped by impact, at most four at a time; "I don't know" turns into questions for the dentist or insurer; voice from phone and browser; multi-page PDF fallback | `backend/src/features/agent-jobs/domain/` (extraction, adaptive); agent evaluation 5/5 |
| **Architecture & Methodology** | Contracts first (Zod, shared by API, web and mobile); feature folders; ports and adapters; infrastructure as code; change sets reviewed before every deploy; decisions logged | [`packages/contracts`](../packages/contracts); [build log](02_BUILD_PLAN.md#14-completion-and-change-log) |
| **Complexity** | Bounded schedule optimizer across benefit years; a single agent with a bounded tool loop; asynchronous jobs with leases and a dead-letter queue; no redundant infrastructure | [`packages/benefits-engine`](../packages/benefits-engine) (pure, deterministic); job runner and worker |

## Honest limits

- From uploaded documents the assistant records the current benefit year only. The cross-year timing option appears when next year's terms are supplied (as in the sample case).
- Waiting periods, exclusions and frequency limits are detected and reported, not estimated.
- Estimates only; the dentist and insurer decide final treatment and costs.
