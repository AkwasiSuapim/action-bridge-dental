import type { LedgerEvent } from '@actionbridge/contracts';
import {
  Check,
  CheckCheck,
  ClipboardList,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FooterActions,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  amountLabel,
  currentYear,
  dentistQuestion,
  money,
  scenarioTitle,
  treatmentTitle,
} from '../../domain/model';
import { isSampleCase } from '../../domain/provenance';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../state/auth';
import { useCase, useResults } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';
import { Conditions, TreatmentTimeline } from '../options/financial-components';

/**
 * Review and save. The server recomputes the chosen option for this exact revision; the browser
 * sends only the option ID, the revision and consent. One idempotency key per Save action, reused
 * for retries, so a double click or a retry is one logical save.
 */
export function ReviewPage() {
  const api = useApi();
  const { record, setSaved, reload } = useCase();
  const { selected: scenario, status } = useResults();
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const key = useRef<string | null>(null);

  if (!record || (!scenario && status === 'loading'))
    return (
      <div className="page narrow centered" role="status">
        <Orb size={120} active />
        <p className="muted">Loading your plan…</p>
      </div>
    );
  if (!scenario)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="This estimate needs recalculation"
          description="Your details changed or no comparison is available. Review them before saving."
          action={
            <Button onClick={() => navigate('/facts')}>
              Review information
            </Button>
          }
        />
      </div>
    );

  const submit = async () => {
    if (!consent || saving) return;
    key.current ??= crypto.randomUUID();
    setSaving(true);
    setFailure(null);
    try {
      const result = await api.saveStrategy(
        record.caseId,
        {
          scenarioId: scenario.scenarioId,
          expectedRevision: record.caseRevision,
          consent: true,
        },
        key.current,
      );
      setSaved(result.strategy);
      key.current = null;
      navigate('/saved', { replace: true });
    } catch (caught) {
      const error = asApiError(caught);
      // The case moved on: this option no longer matches what's on screen.
      if (error.code === 'REVISION_CONFLICT') {
        key.current = null;
        void reload();
      }
      setFailure(error);
    } finally {
      setSaving(false);
    }
  };

  if (saving)
    return (
      <div className="page narrow centered">
        <Orb size={180} active />
        <h2 role="status">Saving your plan…</h2>
      </div>
    );
  return (
    <div className="page">
      <PageHeading
        title="Review this plan"
        description="Check the dates, costs and assumptions before you save."
      />
      {failure && (
        <div className="stack">
          <ApiNotice error={failure} />
          {failure.code === 'REVISION_CONFLICT' ? (
            <p className="small muted">
              Your details changed. Compare your options again before saving.
            </p>
          ) : (
            <p className="small muted">
              Your choice and consent are kept. Trying again won’t save twice.
            </p>
          )}
        </div>
      )}
      <div className="financial-grid">
        <div className="stack">
          <Card>
            <Badge tone="green">Your selected option</Badge>
            <h2>{scenarioTitle(scenario)}</h2>
            <Row
              label="You pay · Estimated"
              value={money(scenario.estimate.totals.patientPaysCents)}
              strong
            />
            <Row
              label="Insurer contribution"
              value={money(scenario.estimate.totals.insurerPaysCents)}
            />
            <Button variant="secondary" onClick={() => navigate('/options')}>
              Edit selection
            </Button>
          </Card>
          <TreatmentTimeline scenario={scenario} />
          <Conditions />
        </div>
        <div className="stack">
          <Card>
            <div className="section-title">
              <ShieldCheck size={22} />
              <h3>What saving does</h3>
            </div>
            <div className="check-point">
              <Check size={18} />
              <p>Keeps this comparison and your answers in your account.</p>
            </div>
            <div className="check-point">
              <Check size={18} />
              <p>Shows the plan in My plan and records the save in Activity.</p>
            </div>
            <p className="muted small">
              It doesn't book treatment, submit a claim, contact anyone or use
              insurance benefits.
            </p>
          </Card>
          <Card>
            <h3>Based on your confirmed details</h3>
            <Row
              label="Coverage"
              value={
                isSampleCase(record)
                  ? 'Sample individual PPO'
                  : 'Your plan, as entered'
              }
            />
            <Row label="Procedure scope" value={treatmentTitle(record)} />
            <Row
              label="Reported paid this year"
              value={amountLabel(
                currentYear(record)?.[1].insurerAlreadyPaidCents,
              )}
            />
            <Row label="Case version" value={record.caseRevision} />
            <Button variant="ghost" onClick={() => navigate('/facts')}>
              Change details
            </Button>
          </Card>
          <label className={`consent-box ${consent ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Save this plan and my answers in my account.</span>
          </label>
          <Button
            className="full"
            icon={Check}
            disabled={!consent}
            onClick={() => void submit()}
          >
            {failure && failure.code !== 'REVISION_CONFLICT'
              ? 'Try saving again'
              : 'Save this plan'}
          </Button>
          <p className="small muted text-center">
            Your explicit choice. No external action.
          </p>
        </div>
      </div>
    </div>
  );
}

export function QuestionCard() {
  const { record, saved } = useCase();
  const question =
    saved && record
      ? dentistQuestion(record, saved.scenario)
      : 'Confirm the fees, coverage and dates with your dentist before choosing a plan.';
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    setCopied(false);
    setFallback(false);
  }, [question]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(question);
      setCopied(true);
    } catch {
      setFallback(true);
    }
  };
  return (
    <Card className="stack">
      <h3>A useful next step</h3>
      <p className="muted small">
        Take this question to your dentist before choosing dates.
      </p>
      <blockquote>{question}</blockquote>
      <div>
        <Button
          variant="secondary"
          icon={copied ? CheckCheck : Copy}
          onClick={() => void copy()}
        >
          {copied ? 'Copied' : 'Copy question'}
        </Button>
      </div>
      {copied && (
        <p role="status" className="accent small">
          Question copied to your clipboard.
        </p>
      )}
      {fallback && (
        <Field label="Select and copy this question">
          <textarea
            readOnly
            rows={3}
            value={question}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      )}
    </Card>
  );
}

const ACTION_TITLE: Record<LedgerEvent['action'], string> = {
  case_created: 'Case started',
  case_updated: 'Case details updated',
  strategy_saved: 'Plan saved',
};
const ROUTINE = new Set<LedgerEvent['action']>(['case_updated']);

/** Recorded history for one case, from the server ledger (never a simulated action). */
export function useLedger(caseId: string | null | undefined) {
  const api = useApi();
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    if (!caseId) return;
    setError(null);
    try {
      setEvents((await api.ledger(caseId)).events);
    } catch (caught) {
      setError(asApiError(caught));
    }
  }, [api, caseId]);
  useEffect(() => {
    setEvents(null);
    void load();
  }, [load]);
  return { events, error, load };
}

export function ledgerTitle(event: LedgerEvent) {
  return ACTION_TITLE[event.action];
}

export function PlanHistory() {
  const { record } = useCase();
  const { events, error, load } = useLedger(record?.caseId);
  const [showRoutine, setShowRoutine] = useState(false);
  const hidden = (events ?? []).filter((e) => ROUTINE.has(e.action)).length;
  return (
    <Card>
      <h3>Plan history</h3>
      <p className="muted small">
        What happened to this case, newest first, as recorded by the service.
      </p>
      {error ? (
        <ApiNotice error={error} onRetry={() => void load()} />
      ) : !events ? (
        <p className="muted small" role="status">
          Loading history…
        </p>
      ) : events.length ? (
        <ol className="history-list">
          {events
            .filter((e) => showRoutine || !ROUTINE.has(e.action))
            .map((e) => (
              <li key={e.eventId}>
                <time className="small muted" dateTime={e.at}>
                  {new Date(e.at).toLocaleString('en-US')} · You
                </time>
                <strong>{ledgerTitle(e)}</strong>
                <p className="small muted">Version {e.caseRevision}</p>
              </li>
            ))}
        </ol>
      ) : (
        <p className="muted">No history yet.</p>
      )}
      {hidden > 0 && (
        <Button variant="ghost" onClick={() => setShowRoutine(!showRoutine)}>
          {showRoutine
            ? 'Hide routine entries'
            : `Show ${hidden} routine ${hidden === 1 ? 'entry' : 'entries'}`}
        </Button>
      )}
    </Card>
  );
}

export function SavedPage() {
  const { record, saved, loading } = useCase();
  const navigate = useNavigate();
  if (!saved || !record)
    return loading ? (
      <div className="page narrow centered" role="status">
        <Orb size={120} active />
      </div>
    ) : (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="No saved plan yet"
          description="Compare your options and review the plan you want to keep."
          action={
            <Button onClick={() => navigate('/options')}>Go to options</Button>
          }
        />
      </div>
    );
  const scenario = saved.scenario;
  return (
    <div className="page medium">
      <div className="saved-heading">
        <div className="success-icon">
          <Check size={32} />
        </div>
        <PageHeading
          title="Your plan is saved"
          description="A clearer next step, ready when you are."
        />
      </div>
      <Card>
        <Badge tone="green">
          Saved {new Date(saved.savedAt).toLocaleString('en-US')}
          {isSampleCase(record) ? ' · Sample data' : ''}
        </Badge>
        <h2>{scenarioTitle(scenario)}</h2>
        <Row
          label="Estimated patient cost"
          value={money(scenario.estimate.totals.patientPaysCents)}
          strong
        />
        <Row
          label="Insurer contribution"
          value={money(scenario.estimate.totals.insurerPaysCents)}
        />
        <p className="small muted">
          Saving keeps your plan. It doesn't book treatment, submit a claim or
          use benefits.
        </p>
        <Button
          variant="secondary"
          onClick={() => navigate('/details?saved=1')}
        >
          View saved details
        </Button>
      </Card>
      <QuestionCard />
      <PlanHistory />
      <FooterActions>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
        <Button onClick={() => navigate('/my-plan')}>View My plan</Button>
      </FooterActions>
    </div>
  );
}
