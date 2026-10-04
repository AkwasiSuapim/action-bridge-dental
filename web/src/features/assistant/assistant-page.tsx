import type {
  AgentJobView,
  MissingFieldBlock,
  UiBlock,
} from '@actionbridge/contracts';
import {
  Check,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  LoaderCircle,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

const STAGE_LABEL: Record<string, string> = {
  reading_input: 'Reading what you shared',
  checking_missing_facts: 'Checking what’s still needed',
  retrieving_evidence: 'Finding the supporting details',
  calculating_costs: 'Calculating with your plan’s rules',
  comparing_dates: 'Comparing permitted dates',
  preparing_explanation: 'Preparing what to show you',
  analyzing: 'Analyzing',
};

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
  const seconds = Math.max(
    0,
    Math.round((now - new Date(job.createdAt).getTime()) / 1000),
  );
  // The latest status per stage, in the order stages first appeared.
  const stages = useMemo(() => {
    const latest = new Map<string, AgentJobView['events'][number]>();
    for (const event of job.events) latest.set(event.stage, event);
    return [...latest.values()];
  }, [job.events]);
  return (
    <div className="page working-layout">
      <div className="working-intro">
        <Orb size={220} active />
        <PageHeading
          title="Working on it"
          description={`${seconds < 2 ? 'Just started' : `${seconds} seconds`} · your case is unchanged until you confirm.`}
        />
      </div>
      <Card className="working-stages">
        <p className="eyebrow">What I’m doing</p>
        {stages.length === 0 ? (
          <p className="muted" role="status">
            Waiting to start…
          </p>
        ) : (
          <ol className="stage-list" aria-live="polite">
            {stages.map((event) => {
              const Icon =
                event.status === 'completed'
                  ? CheckCircle2
                  : event.status === 'failed'
                    ? XCircle
                    : event.status === 'skipped'
                      ? MinusCircle
                      : event.status === 'started'
                        ? LoaderCircle
                        : Circle;
              return (
                <li
                  key={event.stage}
                  className={event.status === 'completed' ? 'done' : 'current'}
                >
                  <Icon
                    size={20}
                    className={event.status === 'started' ? 'spin' : undefined}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{STAGE_LABEL[event.stage] ?? event.stage}</strong>
                    <small>{event.summary}</small>
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

function Step({ job }: { job: AgentJobView }) {
  const api = useApi();
  const navigate = useNavigate();
  const { reload } = useCase();
  const questions = questionsOf(job.questions);
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(questions));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const confirmations = questions.filter((q) => q.inputType === 'fact_review');
  const asks = questions.filter((q) => q.inputType !== 'fact_review');
  const notices = (job.questions?.blocks ?? []).filter(
    (b): b is Extract<UiBlock, { type: 'notice' }> => b.type === 'notice',
  );
  const set = (questionId: string, draft: Draft) => {
    setDrafts((current) => ({ ...current, [questionId]: draft }));
    setProblems(({ [questionId]: _cleared, ...rest }) => rest);
  };
  const submit = async () => {
    if (busy) return;
    const built = buildAnswers(questions, drafts, job.caseRevision);
    if (!built.ok) {
      setProblems(
        Object.fromEntries(
          built.problems.map((p) => [p.questionId, p.message]),
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
  const declined = confirmations.filter((q) => {
    const d = drafts[q.questionId];
    return d?.kind === 'confirm' && !d.value;
  }).length;
  const cta =
    confirmations.length > 0 && asks.length === 0
      ? declined > 0
        ? 'Use the rest and continue'
        : 'Looks right — continue'
      : 'Continue';
  return (
    <div className="page medium assistant-page">
      {notices.map((n) => (
        <AssistantMessage key={n.id} title={n.title} body={n.body} />
      ))}
      {confirmations.length > 0 && (
        <section className="stack" aria-labelledby="understood">
          <div>
            <h3 id="understood">Here’s what I understood</h3>
            <p className="small muted">
              Choose “Not right” on anything that’s wrong — I’ll leave it out
              and you can add it yourself.
            </p>
          </div>
          <div className="understood-grid">
            {confirmations.map((q) => (
              <UnderstoodCard
                key={q.questionId}
                block={q}
                draft={drafts[q.questionId]}
                onChange={(d) => set(q.questionId, d)}
              />
            ))}
          </div>
        </section>
      )}
      {asks.map((q) => (
        <QuestionCard
          key={q.questionId}
          block={q}
          draft={drafts[q.questionId]}
          problem={problems[q.questionId]}
          onChange={(d) => set(q.questionId, d)}
        />
      ))}
      {failure && <ApiNotice error={failure} onRetry={() => void submit()} />}
      <FooterActions note="Each answer goes straight into the calculator. Nothing is used until you continue.">
        <Button variant="secondary" onClick={() => navigate('/facts')}>
          Finish later
        </Button>
        <Button icon={Check} busy={busy} onClick={() => void submit()}>
          {cta}
        </Button>
      </FooterActions>
    </div>
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
  const accepted = draft?.kind === 'confirm' ? draft.value : true;
  const fromDocument = block.reason.startsWith('From your document');
  const quote = block.reason.replace(
    /^From your (description|document):\s*/,
    '',
  );
  const name = `confirm-${block.questionId}`;
  return (
    <Card className={`understood-card ${accepted ? '' : 'declined'}`}>
      <span className="small muted">
        {block.label.replace(/^Is this right\?\s*/, '')}
      </span>
      <strong>{String(block.candidateValue ?? '')}</strong>
      <blockquote>
        <Badge tone="green">
          {fromDocument ? 'From your document' : 'From your words'}
        </Badge>{' '}
        {quote}
      </blockquote>
      <fieldset className="segmented confirm-choice">
        <legend className="visually-hidden">
          Is this right? {String(block.candidateValue ?? '')}
        </legend>
        {[
          [true, 'Yes'],
          [false, 'Not right'],
        ].map(([value, label]) => (
          <label
            key={String(label)}
            className={accepted === value ? 'active' : ''}
          >
            <input
              type="radio"
              name={name}
              checked={accepted === value}
              onChange={() =>
                onChange({ kind: 'confirm', value: value as boolean })
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
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
    <Card className="stack question-card">
      <div>
        <h3>{block.label}</h3>
        <p className="small muted">{block.reason}</p>
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
  const { record } = useCase();
  const { status, data, error, retry } = useResults();
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
