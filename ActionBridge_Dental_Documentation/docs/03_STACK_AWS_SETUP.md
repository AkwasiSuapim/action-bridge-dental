# 03 — Stack, AWS setup and data acquisition

ActionBridge Dental · v2.0 · Reference pages checked 3 October 2026. These are setup instructions, not a record of resources deployed.

## 1. Stack and responsibility

| Component | Choice | Why / when |
|---|---|---|
| Mobile | Existing Expo 57, React Native, TypeScript, Expo Router | Phone experience; platform-specific details in document 04 |
| Shared types/validation | TypeScript and runtime schemas (Zod in existing backend) | Same units, errors and model boundaries on both sides |
| Benefits engine | Pure TypeScript package | Reproducible math and bounded schedule comparison |
| API | API Gateway HTTP API + Lambda | Validated, authorized application operations |
| Persistent state | DynamoDB | Cases, revisions, jobs, strategies, ledger |
| Agent | Bedrock foundation model + one AgentCore Runtime | Structured interpretation and bounded tool execution |
| Async delivery | SQS + Lambda worker | Recoverable model jobs separate from phone request lifetime |
| Documents, if enabled | Private S3 + text extraction/Textract | Original source and page provenance; manual input still works |
| Authentication | Cognito/OIDC JWT authorizer | Managed identity; no home-built passwords |
| Reminders | Local notifications first; EventBridge plus delivery adapter if time | One tested implementation, not two incomplete channels |
| Diagnostics | CloudWatch | Sanitized errors, job progress, timing and version evidence |
| Infrastructure | Existing AWS SAM; agent CLI-managed stack separately if used | Reproducible deployment; explicit resource ownership |

The slide 27 AWS pathway uses Kiro, Bedrock and AgentCore, with the team's own AWS account and no event-provided AWS credits. Do not interpret this as proof of free usage. Verify account credits, quotas and Region yourself. Kiro is development tooling, not the mobile runtime. No external model-provider API key is needed when all inference uses Bedrock through IAM.

## 2. Account and tools: shortest safe route

1. Use [AWS account signup](https://aws.amazon.com/) only if the team lacks an authorized account. One named billing owner; enable root MFA and do not use root access keys.
2. Arrange scoped team access through the account's configured federation/IAM Identity Center or authorized IAM roles. Never share a root login or copy teammates' credentials into mobile code.
3. Choose one Region after checking the chosen model, Runtime and supporting services. Record `AWS_REGION`; do not copy an example Region without checking availability.
4. Configure a budget notification, service quotas, conservative concurrency and model-token limits. Alerts notify; they are not a hard spending stop.
5. Install Git, Node.js compatible with the mobile SDK (see document 04), [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html). Docker is needed for `sam local` emulation, not for unit tests.
6. Verify the CLI's current caller and Region before deployment. With an already configured SSO profile, use `aws sso login --profile actionbridge`; then `aws sts get-caller-identity --profile actionbridge`. Use only a profile your account owner configured.
7. Follow [Kiro student setup](https://kiro.dev/students) or [downloads](https://kiro.dev/downloads) if using the event's recommended development workflow. Keep requirements/design/tasks in the allowed repository.

Permission errors are stop conditions for that cloud operation. Ask the account owner/mentor to grant the minimum required access; continue local tests rather than trying credentials from another environment.

## 3. Backend starter verification and deployment

Commands below are run from the **existing serverless starter root**, not this documentation ZIP and not `mobile/`. The commands exist in its package scripts; they do not imply the target Dental routes already exist.

```bash
npm ci
npm run check
npm run validate:aws
npm run build:aws
```

If installing fails, record the actual engine/dependency error and correct it deliberately; do not delete the lockfile or run force-upgrades as a first response. The starter declares Node 22+, but confirm each locked tooling package's engine requirements.

After permission to deploy and review of the template, `sam deploy --guided --template-file .aws-sam/build/template.yaml --profile actionbridge` can deploy the built starter. Confirm stack name, Region, IAM changes and cost implications in its prompts. Capture `ApiBaseUrl` and table name; the generic deployment proves only health and case persistence.

Extend infrastructure incrementally with Dental handlers, managed authorizer, queue/worker, and only then optional document/reminder resources. Do not deploy unused placeholder endpoints. Keep the agent CLI's generated stack and the SAM stack from claiming ownership of the same IAM role, bucket or table; pass identifiers across explicit configuration boundaries.

Smoke-test, in order: health, authorized create case, read case, wrong-owner denial, update revision, estimate, scenarios, stale-revision rejection. Run the same fixture on a physical phone before introducing the agent.

## 4. Bedrock and AgentCore setup

Open the [Bedrock console](https://console.aws.amazon.com/bedrock/) in the chosen Region. Use the model catalog to choose an available model; check provider access requirements and invoke one small synthetic request. Record exact model ID/inference profile, Region and permissions. [Model access reference](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

AgentCore has a documented [TypeScript CLI workflow](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli-typescript.html). Install its current CLI, then record/pin the working version. Useful commands from that workflow:

```bash
npm install -g @aws/agentcore
agentcore --version
agentcore create
agentcore dev
```

Create the agent project in a separate intended `backend/agent/` area after inspecting generated paths; do not scaffold over existing code. Select TypeScript, a supported framework such as Strands, Bedrock, and the documented direct-code deployment option. Review generated instructions/configuration before merging. Development startup is not deployment. Use the official deploy/invoke steps after reviewing permissions; save the Runtime ARN and working version.

For direct Node deployment, TypeScript must be compiled to JavaScript and native dependencies must match the Runtime architecture. Follow the [Node deployment reference](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-node.html); do not upload uncompiled `.ts` files and assume execution.

First smoke tool: run the exact deterministic fixture and return its stored values. Next add interpretation and evidence. Do not enable browser, shell, unrestricted URL retrieval or every AgentCore component. Our small source corpus can use direct indexed lookup without embeddings/vector storage.

If Runtime setup fails within the Phase 0 spike, record the blocker and consult a mentor about requirements. Preserve the deterministic API and a clearly documented direct-Bedrock fallback while troubleshooting permitted configuration; do not represent fallback as Runtime deployment.

## 5. Configuration: where each value belongs

| Value | Obtain from | Store in |
|---|---|---|
| API base URL | SAM output including stage | Mobile public configuration |
| Mock/live flag | Team decision | Mobile public configuration, with visible mode badge |
| OIDC/Cognito public client ID and issuer | Managed identity configuration | Public client settings; tokens acquired at sign-in |
| AWS Region/profile | Team's authorized account setup | Developer CLI/server settings |
| Table/bucket/queue identifiers | Infrastructure outputs | Backend environment |
| Bedrock model ID and Runtime ARN | Successful smoke deployment | Server environment |
| IAM credentials | Existing approved CLI role/federation | AWS credential workflow, never mobile or Git |
| Push/email provider secrets, if needed | Selected delivery service | Server secrets/configuration, never `EXPO_PUBLIC_*` |

Example **server setting names to implement**, not all consumed by the existing starter: `APP_ENV`, `AWS_REGION`, `TABLE_NAME`, `BEDROCK_MODEL_ID`, `AGENT_RUNTIME_ARN`, `JOB_QUEUE_URL`, optional `UPLOAD_BUCKET`, `MAX_DOCUMENT_BYTES`, `MAX_AGENT_TOOL_CALLS`. An `.env` file alone does not make Lambda load it; wire the values explicitly through SAM/deployment configuration. Check `.env.example` against actual code.

Use dev and stable-demo configurations. Avoid logging environment dumps, signed URLs, bearer tokens or source documents. Confirm which exact deployment the phone is using before rehearsal.

## 6. Where data comes from

No live insurer balance feed, provider directory or licensed cost API has been established. Build around data we actually have permission to use.

| Data | Preferred source | Acquisition and validation | Missing-source fallback |
|---|---|---|---|
| Plan terms | Organizer's dental materials; user-supplied actual plan | Extract deductible, insurer max, rates, periods, limitations and network clauses; retain page/section; user review | Manual entry or approved synthetic plan, labeled |
| Treatment | Dentist quote or treatment estimate | Extract procedure/code, tooth only if needed, billed fee, proposed date; confirm uncertain code | Guided procedure cards |
| Allowed amount | Insurer/provider estimate for this plan and provider | Keep distinct from billed amount and benchmark | Ask; conditional range only with documented bounds, otherwise no exact estimate |
| Prior annual insurer usage | Current insurer statement/portal summary; relevant EOBs | Confirm as-of date, scope and paid versus pending; avoid duplicate claim accumulation | User-entered reported balance, labeled |
| Network status | User/provider/insurer confirmation for this specific plan | Record source and date | “Unknown”; do not claim live provider verification |
| Treatment timing | Dentist-supplied allowable dates/order | Confirm source and windows; fixed when no flexibility evidence | Show baseline only and question to ask dentist |
| Market cost reference | Challenge's FAIR Health link, if permitted | Preserve location, date, code, fee definition and permission; treat as benchmark only | Synthetic test prices or actual quote; never relabel invented prices as FAIR Health |
| User preferences | Employee answers | Budget/desired dates are preferences, not clinical permission | Optional; do not block unrelated estimates |

### Source priority and conflict handling

Actual applicable plan terms and current insurer/provider information govern the estimate, subject to uncertainty. General articles and enrollment videos explain concepts; they do not replace the member's detailed plan. Surface conflicting documents or dates instead of silently choosing a favorable number. User confirmation validates the entered value, not insurer approval.

Each source record needs: source ID/title, type, document version or access date, page/section, field paths, permitted use, applicability, and unresolved assumptions. A numeric result points to its input facts and engine version. Do not redistribute a copyrighted codebook or full third-party plan material without the needed rights; use authorized excerpts/data and attribution.

### External reference access status

- [Dental materials](https://tinyurl.com/codelinc11dental) and [enrollment video](https://tinyurl.com/codelinc11dentalvideo): linked in slide 14; destination contents could not be retrieved in this documentation pass. Obtain from the organizer/mentor. No actual plan rates have been verified from them.
- [FAIR Health dental estimator](https://www.fairhealthconsumer.org/dental/category): page accessible; supports code/keyword lookup and distinguishes consumer and business use. We have not obtained a bulk dataset, API entitlement or scraping permission.
- [ADA plan limitations](https://www.ada.org/resources/practice/dental-insurance/typical-dental-plan-benefits-and-limitations) and [EOB explanation](https://www.ada.org/resources/practice/dental-insurance/explanation-of-benefits-statement): explanatory background, not binding plan terms.

## 7. Document extraction workflow, if selected

1. App obtains permission to select a document. Show privacy purpose and supported input limits.
2. Authorized backend issues a short-lived S3 upload target. Use an initial application policy of at most 5 MB and 10 pages, configurable and below verified service limits; reject unsupported formats.
3. App uploads; server verifies ownership, size/type and object completion. Job references server-created document ID, not an arbitrary URL.
4. Extract embedded PDF text where reliable. For scans/images, use Textract. Multipage PDFs require an asynchronous completion path; consult [Textract asynchronous processing](https://docs.aws.amazon.com/textract/latest/dg/async.html) and [API workflow](https://docs.aws.amazon.com/textract/latest/dg/api-async.html).
5. Preserve page/line provenance. Bedrock proposes structured values; schemas reject invalid outputs. Conflicts and low-confidence extraction go to review.
6. User reviews before calculation. If extraction is unavailable, preserve the upload context and offer manual entry rather than an endless spinner.
7. Apply documented retention/deletion to raw and extracted data. Use synthetic documents for the demo.

Do not add Textract, camera and multi-page processing if they threaten the core deadline. Text/manual input fully supports CH-01. Never claim the current voice mock or upload affordance performs real extraction.

## 8. Reminders: pick one real channel

**Fastest bonus path:** opt-in local Expo notification. Store consent, local scheduling reference and timezone; allow cancellation. Test foreground/background receipt on the demo phone. The current SDK documentation distinguishes local notifications from remote push support: [Expo notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

**Cloud extension:** [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html) invokes a narrowly scoped Lambda, which calls a configured push/email service. Scheduler does not itself prove the phone received a notification. Configure the delivery credentials/channel, retries, idempotency, cancellation and receipts. SES/SNS setup or sandbox limits can block real delivery; no “sent” animation as a substitute.

Reminder copy: “Review your remaining benefits and any dentist-recommended care before your plan resets.” Do not imply remaining benefits are cash or encourage unnecessary treatment. Use a near-term, explicitly labeled test reminder for judging; never wait for December to prove the feature.

## 9. Cost, security and shutdown checklist

- Record account owner, Region, resource inventory, permissions and working versions.
- Keep private objects, owner checks, short-lived URLs and capped input/model work.
- Redact logs; verify diagnostic traces contain no real patient data.
- Test real API connectivity from venue network early. A phone's `localhost` is the phone, not the developer laptop.
- After judging, follow an approved cleanup plan for named demo resources; cancel reminders/queues and stop chargeable services. Back up authorized source and sanitized evidence before deleting anything.
- Do not remove broad account resources, ignore retention obligations, or assume deleting one SAM stack also deletes the separately managed agent stack.

## 10. Event links and handoff links

| Purpose | Link |
|---|---|
| Current event and criteria | [Devpost overview](https://codelinc11.devpost.com/) |
| Published rules | [Devpost rules](https://codelinc11.devpost.com/rules) |
| Opening deck | [Challenge presentation](https://tinyurl.com/codelinc11challenge) |
| Team registration | [Team form](https://tinyurl.com/codelinc11team) |
| Mentor communication | [Event Discord](https://tinyurl.com/codelinc11discord) |
| Dental source package | [Dental materials](https://tinyurl.com/codelinc11dental) |
| Education video | [Dental video](https://tinyurl.com/codelinc11dentalvideo) |
| Benchmark reference | [FAIR Health estimator](https://www.fairhealthconsumer.org/dental/category) |

Some embedded deck hyperlinks point to earlier event aliases; use the displayed current `codelinc11` link and verify the destination with organizers. The dental short links remain unresolved here. Do not claim every listed destination has been inspected.

Team must add its actual repository, demo-access/build link, readme/setup instructions and optional recording link only after creation. Never insert fictional working URLs into the presentation. Put technical citations and licensed data attribution in a short appendix rather than crowding the live demo.
