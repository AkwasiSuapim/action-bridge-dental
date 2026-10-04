import {
  jobSteps,
  plainSummary,
  spokenAnswer,
  spokenChoice,
  termFor,
  type AgentJobView,
  type MissingFieldBlock,
  type UiBlock,
} from '@actionbridge/contracts';
import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Mic,
  Volume2,
  LoaderCircle,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  FooterActions,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  buildAnswers,
  initialDrafts,
  questionsOf,
  type Draft,
  type Drafts,
} from '../../domain/answers';
import { money } from '../../domain/model';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../state/auth';
import { useCase, useResults } from '../../state/case-store';
import { useJob } from '../../state/use-job';
import { ListenButton, VoiceToggle } from '../../components/listen';
import {
  canListen,
  listenOnce,
  speak,
  stopListening,
  stopSpeaking,
  useAutoRead,
  useVoiceGuidance,
} from '../../voice/voice';

/**
 * Assistant workspace. Renders only server-validated UI blocks: real stage events while working,
 * "here is what I understood" confirmations with their quotes, grouped questions, and results
 * that come from the calculator for the exact revision — never from the assistant's text.
 */
export function AssistantPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { job, error, timedOut, refresh } = useJob(jobId);
  const api = useApi();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<ApiError | null>(null);

  if (error)
    return (
      <div className="page narrow">
        <ApiNotice error={error} onRetry={() => void refresh()} />
      </div>
    );
  if (!job)
    return (
      <div className="page narrow centered" role="status">
        <Orb size={120} active />
        <p className="muted">Opening the assistant…</p>
      </div>
    );

  if (job.status === 'queued' || job.status === 'running')
    return (
      <Working
        job={job}
        timedOut={timedOut}
        actionError={actionError}
        onRefresh={() => void refresh()}
        onCancel={async () => {
          try {
            await api.cancelJob(job.jobId);
            navigate('/facts');
          } catch (caught) {
            setActionError(asApiError(caught));
          }
        }}
      />
    );
  if (job.status === 'needs_information')
    return <Step key={job.jobId} job={job} />;
  if (job.status === 'completed') return <Finished job={job} />;
  if (job.status === 'cancelled')
    return (
      <div className="page narrow">
        <Notice>
          You stopped the assistant. Nothing was changed. You can start again
          any time.
        </Notice>
        <Button onClick={() => navigate('/')}>Back to Home</Button>
      </div>
    );
  return <Failed job={job} onRetried={() => void refresh()} />;
}

export function ApiNotice({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  return (
    <Notice tone={error.options.retryable ? 'warning' : 'danger'}>
      {error.message}
      {error.options.issues?.length ? (
        <ul className="hint-list small">
          {error.options.issues.map((issue, i) => (
            <li key={`${issue.fieldPath ?? 'issue'}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {error.options.requestId ? (
        <span className="block small">
          Reference: {error.options.requestId}
        </span>
      ) : null}
      {onRetry && (
        <span className="block">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </Notice>
  );
}

function Working({
  job,
  timedOut,
  actionError,
  onRefresh,
  onCancel,
}: {
  job: AgentJobView;
  timedOut: boolean;
  actionError: ApiError | null;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const steps = useMemo(() => jobSteps(job.events), [job.events]);
  const seconds = (from: string) =>
    Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));
  return (
    <div className="page working-layout">
      <div className="working-intro">
        <Orb size={220} active />
        <PageHeading
          title="Working on it"
          description={`${seconds(job.createdAt)} seconds so far · nothing changes in your case until you confirm.`}
        />
      </div>
      <Card className="working-stages">
        <p className="eyebrow">What I’m doing</p>
        {steps.length === 0 ? (
          <p className="muted" role="status">
            Starting…
          </p>
        ) : (
          <ol className="stage-list" aria-live="polite">
            {steps.map((step) => {
              const Icon =
                step.status === 'done'
                  ? CheckCircle2
                  : step.status === 'failed'
                    ? XCircle
                    : step.status === 'skipped'
                      ? MinusCircle
                      : LoaderCircle;
              return (
                <li
                  key={step.key}
                  className={step.status === 'active' ? 'current' : 'done'}
                >
                  <Icon
                    size={20}
                    className={step.status === 'active' ? 'spin' : undefined}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{step.label}</strong>
                    <small>
                      {step.status === 'active'
                        ? `${seconds(step.startedAt)}s${step.hint ? ` · ${step.hint}` : ''}`
                        : (step.result ?? 'Done')}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {timedOut && (
          <Notice tone="warning">
            This is taking longer than usual. Your input is safe.{' '}
            <Button variant="secondary" onClick={onRefresh}>
              Check again
            </Button>
          </Notice>
        )}
        {actionError && <ApiNotice error={actionError} />}
        <div className="actions">
          <Button variant="ghost" onClick={onCancel}>
            Stop
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * One item at a time: each "Is this right?" card, then each question, then a short summary to
 * check before anything is sent. Answers are the same drafts the grouped view used.
 */
function Step({ job }: { job: AgentJobView }) {
  const api = useApi();
  const navigate = useNavigate();
  const { reload } = useCase();
  const questions = questionsOf(job.questions);
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(questions));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const notices = (job.questions?.blocks ?? []).filter(
    (b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice',
  );
  const current = questions[index];
  const reviewing = index >= questions.length;

  const set = (questionId: string, draft: Draft) => {
    setDrafts((existing) => ({ ...existing, [questionId]: draft }));
    setProblems(({ [questionId]: _cleared, ...rest }) => rest);
  };
  /** Checks only this item before moving on. */
  const next = () => {
    if (!current) return;
    const built = buildAnswers([current], drafts, job.caseRevision);
    if (!built.ok) {
      setProblems({ [current.questionId]: built.problems[0]!.message });
      return;
    }
    setIndex((i) => i + 1);
  };
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const submit = async () => {
    if (busy) return;
    const built = buildAnswers(questions, draftsRef.current, job.caseRevision);
    if (!built.ok) {
      setProblems(
        Object.fromEntries(
          built.problems.map((p) => [p.questionId, p.message]),
        ),
      );
      setIndex(
        questions.findIndex(
          (q) => q.questionId === built.problems[0]!.questionId,
        ),
      );
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const { jobId } = await api.answerJob(job.jobId, built.request);
      void reload();
      navigate(`/assistant/${jobId}`, { replace: true });
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Voice guidance: read the key words of each item, then listen for the answer and move on.
  const voiceOn = useVoiceGuidance();
  const [voice, setVoice] = useState<'speaking' | 'listening' | 'tap' | null>(
    null,
  );
  useEffect(() => {
    if (!voiceOn) return setVoice(null);
    let cancelled = false;
    const q = questions[index];
    const say = async (text: string) => {
      setVoice('speaking');
      await speak(api, text);
      return !cancelled;
    };
    const hear = async () => {
      if (!canListen()) return null;
      setVoice('listening');
      const heard = await listenOnce(6000);
      return cancelled ? null : heard;
    };
    /** Asks, listens, and asks once more if the reply was unclear. */
    const ask = async <T,>(
      prompt: string,
      understand: (heard: string) => T | null,
      retry: string,
    ): Promise<T | null> => {
      if (!(await say(prompt))) return null;
      for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
        if (attempt > 0 && !(await say(retry))) return null;
        const heard = await hear();
        const meaning = heard ? understand(heard) : null;
        if (meaning !== null) return meaning;
      }
      if (!cancelled) setVoice('tap');
      return null;
    };
    void (async () => {
      if (!q) {
        const go = await ask(
          `Check before I use these. ${questions.length} items. Say continue to use them, or tap an item to change it.`,
          (heard) => (spokenAnswer(heard) === 'yes' ? true : null),
          'Say continue, or tap an item to change it.',
        );
        if (go && !cancelled) void submitRef.current();
        return;
      }
      const first =
        index === 0
          ? `I found ${questions.filter((x) => x.inputType === 'fact_review').length || questions.length} things to check. `
          : '';
      if (q.inputType === 'fact_review') {
        const answer = await ask(
          `${first}${q.label.replace(/^Is this right\?\s*/, '')}: ${String(q.candidateValue ?? '')}. Is this right?`,
          spokenAnswer,
          'Sorry, I didn’t catch that. Say yes, or not right.',
        );
        if (answer && !cancelled) {
          set(
            q.questionId,
            answer === 'unknown'
              ? { kind: 'unknown' }
              : { kind: 'confirm', value: answer === 'yes' },
          );
          setIndex((i) => i + 1);
        }
      } else if (q.inputType === 'single_select') {
        const choices = q.options.map((o) => o.label).join(', or ');
        const answer = await ask(
          `${first}${q.label} Say ${choices}${q.allowUnknown ? ', or I don’t know' : ''}.`,
          (heard) =>
            spokenAnswer(heard) === 'unknown'
              ? ({ kind: 'unknown' } as Draft)
              : (() => {
                  const id = spokenChoice(heard, q.options);
                  return id
                    ? ({ kind: 'choice', optionId: id } as Draft)
                    : null;
                })(),
          `Sorry, I didn’t catch that. Say ${choices}.`,
        );
        if (answer && !cancelled) {
          set(q.questionId, answer);
          setIndex((i) => i + 1);
        }
      } else {
        const answer = await ask(
          `${first}${q.label} Type your answer, or say I don’t know.`,
          (heard) => (spokenAnswer(heard) === 'unknown' ? true : null),
          'Type your answer, or say I don’t know.',
        );
        if (answer && !cancelled) {
          set(q.questionId, { kind: 'unknown' });
          setIndex((i) => i + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
      stopListening();
    };
    // Re-run per item; drafts are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, voiceOn]);

  return (
    <div className="page narrow assistant-page">
      <div className="voice-row">
        <VoiceToggle />
        {voice && <VoiceStatus state={voice} />}
      </div>
      {index === 0 &&
        notices.map((n) => (
          <AssistantMessage key={n.id} title={n.title} body={n.body} />
        ))}
      <div
        className="step-progress"
        aria-label={
          reviewing ? 'Summary' : `Item ${index + 1} of ${questions.length}`
        }
      >
        {questions.map((q, i) => (
          <span
            key={q.questionId}
            className={i < index ? 'done' : i === index ? 'current' : ''}
          />
        ))}
        <span className={reviewing ? 'current' : ''} />
      </div>
      {current && !reviewing ? (
        <>
          <p className="eyebrow">
            {current.inputType === 'fact_review'
              ? 'Is this right?'
              : 'A quick question'}{' '}
            · {index + 1} of {questions.length}
          </p>
          {current.inputType === 'fact_review' ? (
            <UnderstoodCard
              key={current.questionId}
              block={current}
              draft={drafts[current.questionId]}
              onChange={(d) => {
                set(current.questionId, d);
                // A tap answers it; move straight on.
                setTimeout(() => setIndex((i) => i + 1), 180);
              }}
            />
          ) : (
            <QuestionCard
              key={current.questionId}
              block={current}
              draft={drafts[current.questionId]}
              problem={problems[current.questionId]}
              onChange={(d) => set(current.questionId, d)}
            />
          )}
          <FooterActions>
            {index > 0 ? (
              <Button
                variant="secondary"
                onClick={() => setIndex((i) => i - 1)}
              >
                Back
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/facts')}>
                Finish later
              </Button>
            )}
            {current.inputType !== 'fact_review' && (
              <Button onClick={next}>Next</Button>
            )}
          </FooterActions>
        </>
      ) : (
        <>
          <PageHeading
            title="Check before I use these"
            description="Choose any item to change it. Nothing is used until you continue."
          />
          <Card className="summary-list">
            {questions.map((q, i) => (
              <button
                type="button"
                key={q.questionId}
                className="summary-row"
                onClick={() => setIndex(i)}
                aria-label={`Change: ${q.inputType === 'fact_review' ? String(q.candidateValue ?? '') : q.label}`}
              >
                <span>
                  <strong>
                    {q.inputType === 'fact_review'
                      ? String(q.candidateValue ?? '')
                      : q.label}
                  </strong>
                  <small className="muted">
                    {answerLabel(q, drafts[q.questionId])}
                  </small>
                </span>
                <span className="summary-change">Change</span>
              </button>
            ))}
          </Card>
          {failure && (
            <ApiNotice error={failure} onRetry={() => void submit()} />
          )}
          <FooterActions note="Each answer goes straight into the calculator.">
            <Button
              variant="secondary"
              onClick={() => setIndex(questions.length - 1)}
            >
              Back
            </Button>
            <Button icon={Check} busy={busy} onClick={() => void submit()}>
              Continue
            </Button>
          </FooterActions>
        </>
      )}
    </div>
  );
}

/** What the voice is doing, so people always know when to speak. */
function VoiceStatus({ state }: { state: 'speaking' | 'listening' | 'tap' }) {
  return (
    <p className={`voice-status ${state}`} role="status" aria-live="polite">
      {state === 'speaking' && (
        <>
          <Volume2 size={16} aria-hidden="true" /> Reading…
        </>
      )}
      {state === 'listening' && (
        <>
          <Mic size={16} aria-hidden="true" /> Listening — say your answer
        </>
      )}
      {state === 'tap' && <>I didn’t catch that — tap your answer</>}
    </p>
  );
}

function answerLabel(q: MissingFieldBlock, draft: Draft | undefined): string {
  if (!draft) return 'Not answered';
  if (draft.kind === 'unknown')
    return 'I don’t know — I’ll add it to your questions';
  if (draft.kind === 'confirm')
    return draft.value ? '✓ Yes, use this' : '✗ Not right — left out';
  if (draft.kind === 'choice')
    return q.options.find((o) => o.id === draft.optionId)?.label ?? 'Chosen';
  return q.inputType === 'currency'
    ? `$${draft.text.replace(/^\$/, '')}`
    : draft.text;
}

/** One line saying what a term means, for the fields people find confusing. */
function Meaning({ fieldPath }: { fieldPath: string }) {
  const term = termFor(fieldPath);
  if (!term) return null;
  return (
    <p className="term-meaning small">
      <strong>{term.term}:</strong> {term.definition}
    </p>
  );
}

function AssistantMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="assistant-message">
      <Orb size={44} />
      <div className="assistant-bubble">
        <strong>{title}</strong>
        {body && <p className="small muted">{body}</p>}
      </div>
    </div>
  );
}

function UnderstoodCard({
  block,
  draft,
  onChange,
}: {
  block: MissingFieldBlock;
  draft: Draft | undefined;
  onChange: (d: Draft) => void;
}) {
  const answered = draft?.kind === 'confirm' ? draft.value : null;
  const fromDocument = block.reason.startsWith('From your document');
  const quote = block.reason.replace(
    /^From your (description|document):\s*/,
    '',
  );
  return (
    <Card className="understood-card focus-card">
      <span className="small muted">
        {block.label.replace(/^Is this right\?\s*/, '')}
      </span>
      <strong className="understood-value">
        {String(block.candidateValue ?? '')}
      </strong>
      <blockquote>
        <Badge tone="green">
          {fromDocument ? 'From your document' : 'From your words'}
        </Badge>{' '}
        {quote}
      </blockquote>
      <Meaning fieldPath={block.fieldPath} />
      <div>
        <ListenButton
          text={[
            block.label.replace(/^Is this right\?\s*/, ''),
            String(block.candidateValue ?? ''),
            quote ? 'From what you shared: ' + quote : '',
            termFor(block.fieldPath)?.definition ?? '',
            'Is this right?',
          ]
            .filter(Boolean)
            .join('. ')}
        />
      </div>
      <div className="confirm-buttons">
        <Button
          variant={answered === false ? 'danger' : 'secondary'}
          aria-pressed={answered === false}
          onClick={() => onChange({ kind: 'confirm', value: false })}
        >
          Not right
        </Button>
        <Button
          icon={Check}
          variant={answered === true ? 'primary' : 'secondary'}
          aria-pressed={answered === true}
          onClick={() => onChange({ kind: 'confirm', value: true })}
        >
          Yes, that’s right
        </Button>
      </div>
    </Card>
  );
}

function QuestionCard({
  block,
  draft,
  problem,
  onChange,
}: {
  block: MissingFieldBlock;
  draft: Draft | undefined;
  problem: string | undefined;
  onChange: (d: Draft) => void;
}) {
  const unknown = draft?.kind === 'unknown';
  const name = `q-${block.questionId}`;
  return (
    <Card className="stack question-card focus-card">
      <div>
        <h3>{block.label}</h3>
        <p className="small muted">{block.reason}</p>
      </div>
      <Meaning fieldPath={block.fieldPath} />
      <div>
        <ListenButton
          text={[
            block.label,
            block.reason,
            termFor(block.fieldPath)?.definition ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      {block.inputType === 'single_select' && (
        <fieldset className="choice-list">
          <legend className="visually-hidden">{block.label}</legend>
          {block.options.map((o) => (
            <label
              key={o.id}
              className={`choice ${draft?.kind === 'choice' && draft.optionId === o.id ? 'checked' : ''}`}
            >
              <input
                type="radio"
                name={name}
                checked={draft?.kind === 'choice' && draft.optionId === o.id}
                onChange={() => onChange({ kind: 'choice', optionId: o.id })}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {block.inputType === 'currency' && (
        <Field label="Amount in US dollars" error={problem}>
          <div className="money-input">
            <span>$</span>
            <input
              inputMode="decimal"
              disabled={unknown}
              autoFocus
              value={draft?.kind === 'text' ? draft.text : ''}
              onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
            />
          </div>
        </Field>
      )}
      {block.inputType === 'date' && (
        <Field label="Date" error={problem}>
          <input
            type="date"
            disabled={unknown}
            value={draft?.kind === 'text' ? draft.text : ''}
            onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
          />
        </Field>
      )}
      {block.allowUnknown && (
        <label className="consent-box">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { kind: 'unknown' }
                  : { kind: 'text', text: '' },
              )
            }
          />
          <span>I don’t know</span>
        </label>
      )}
      {problem && block.inputType === 'single_select' && (
        <Notice tone="danger">{problem}</Notice>
      )}
    </Card>
  );
}

function Finished({ job }: { job: AgentJobView }) {
  const navigate = useNavigate();
  const { reload } = useCase();
  const blocks = job.resultBlocks?.blocks ?? [];
  const hasEstimate = blocks.some((b) => b.type === 'cost_summary');
  const notices = blocks.filter(
    (b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice',
  );
  const nextStep = blocks.find(
    (b): b is Extract<UiBlock, { type: 'next_step' }> => b.type === 'next_step',
  );
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.jobId]);
  return (
    <div className="page medium assistant-page">
      <div className="composer-heading">
        <Orb size={110} success={hasEstimate} alert={!hasEstimate} />
        <h2>{hasEstimate ? 'Your estimate is ready' : 'Almost there'}</h2>
      </div>
      {hasEstimate && <EstimateSummary revision={job.caseRevision} />}
      {notices.map((n) => (
        <AssistantMessage key={n.id} title={n.title} body={n.body} />
      ))}
      {nextStep && <NextSteps block={nextStep} />}
      <FooterActions>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
        {hasEstimate ? (
          <Button onClick={() => navigate('/options')}>See your options</Button>
        ) : (
          <Button onClick={() => navigate('/facts')}>Check your details</Button>
        )}
      </FooterActions>
    </div>
  );
}

/** Numbers come from the calculator for this exact revision. */
function EstimateSummary({ revision }: { revision: number }) {
  const api = useApi();
  const { record } = useCase();
  const { status, data, error, retry, comparison } = useResults();
  // Voice guidance reads the plain-language result as soon as it is ready.
  const speech =
    record && data && comparison
      ? `Your estimate is ready. ${
          plainSummary({
            comparison: comparison.baseline,
            alternative: comparison.alternatives[0] ?? null,
            outcome: comparison.outcome,
            procedures: record.procedures,
            selfPay:
              data.coverage.selfPay.status === 'available'
                ? {
                    totalCents: data.coverage.selfPay.totalCents,
                    minusInsuredCents: data.coverage.selfPayMinusInsuredCents,
                  }
                : null,
          }).speech
        }`
      : null;
  useAutoRead(api, speech);
  if (!record || record.caseRevision !== revision)
    return <p className="muted">Loading the calculator’s numbers…</p>;
  if (status === 'error' && error)
    return <ApiNotice error={error} onRetry={retry} />;
  if (!data)
    return (
      <p className="muted" role="status">
        Loading the calculator’s numbers…
      </p>
    );
  if (data.estimate.status !== 'estimated')
    return <Notice>Open your options to see the details.</Notice>;
  const alternative =
    data.scenarios.status === 'estimated'
      ? data.scenarios.alternatives[0]
      : undefined;
  return (
    <Card className="estimate-summary">
      <span className="small muted">
        Doing everything as planned, you would pay about
      </span>
      <strong className="scenario-money">
        {money(data.estimate.totals.patientPaysCents)}
      </strong>
      <Row
        label="Your plan pays"
        value={money(data.estimate.totals.insurerPaysCents)}
      />
      {alternative && (
        <>
          <Row
            label="With a permitted timing change"
            value={money(alternative.estimate.totals.patientPaysCents)}
            strong
          />
          <Row
            label="Estimated difference"
            value={money(alternative.differenceFromBaselineCents)}
          />
          {alternative.conditional && (
            <Badge tone="warning">
              Depends on next year’s coverage staying the same
            </Badge>
          )}
        </>
      )}
      <p className="small muted">
        Estimates from your plan’s rules — not a guarantee of payment.
      </p>
    </Card>
  );
}

function NextSteps({
  block,
}: {
  block: Extract<UiBlock, { type: 'next_step' }>;
}) {
  const [copied, setCopied] = useState(false);
  const who = (a: string) =>
    a === 'self' ? 'You' : a === 'dentist' ? 'Dentist' : 'Insurer';
  const text = block.items
    .map((i) => `• (${who(i.audience)}) ${i.text}`)
    .join('\n');
  return (
    <Card className="stack">
      <h3>{block.title}</h3>
      <ul className="next-step-list">
        {block.items.map((item) => (
          <li key={item.id}>
            <Badge>{who(item.audience)}</Badge>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          icon={copied ? Check : ClipboardCopy}
          onClick={async () => {
            await navigator.clipboard
              .writeText(`${block.title}\n${text}`)
              .catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy these questions'}
        </Button>
      </div>
      <p className="small muted">
        Copying doesn’t send anything. You choose who to share it with.
      </p>
    </Card>
  );
}

function Failed({
  job,
  onRetried,
}: {
  job: AgentJobView;
  onRetried: () => void;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const retry = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api.retryJob(job.jobId);
      onRetried();
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page narrow centered">
      <Orb size={120} alert />
      <Notice tone="warning">
        {job.error?.message ?? 'The assistant could not finish.'}
        <span className="block small">
          Your case is unchanged.
          {job.error?.requestId ? ` Reference: ${job.error.requestId}` : ''}
        </span>
      </Notice>
      {failure && <ApiNotice error={failure} />}
      <div className="actions center">
        {job.error?.retryable && (
          <Button busy={busy} onClick={() => void retry()}>
            Try again
          </Button>
        )}
        <Button
          variant={job.error?.retryable ? 'secondary' : 'primary'}
          onClick={() => navigate('/questions')}
        >
          Answer questions instead
        </Button>
      </div>
    </div>
  );
}
