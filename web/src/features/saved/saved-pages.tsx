import {
  Bell,
  Check,
  CheckCheck,
  ClipboardList,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FooterActions,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  dateLabel,
  dentistQuestion,
  money,
  scenarioTitle,
} from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import { Conditions, TreatmentTimeline } from '../options/financial-components';
import { useComparison } from '../options/use-comparison';

export function ReviewPage() {
  const { state, save } = useDemo();
  const { scenarios } = useComparison();
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lock = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => () => clearTimeout(timer.current), []);
  const scenario =
    scenarios.find((s) => s.scenarioId === state.selectedId) ?? scenarios[0];
  if (!scenario)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="This estimate needs recalculation"
          description="Your details have changed or no comparison is available. Review them before saving."
          action={
            <Button onClick={() => navigate('/facts')}>
              Review information
            </Button>
          }
        />
      </div>
    );
  if (saving)
    return (
      <div className="page narrow centered">
        <Orb size={180} active />
        <h2 role="status">Saving your sample plan…</h2>
        <p className="muted">Keeping the selected estimate in this browser.</p>
      </div>
    );
  const submit = () => {
    if (!consent || lock.current) return;
    lock.current = true;
    setSaving(true);
    timer.current = setTimeout(() => {
      if (
        latest.current.input?.caseRevision !== scenario.estimate.caseRevision ||
        !latest.current.confirmed
      ) {
        lock.current = false;
        setSaving(false);
        navigate('/facts');
        return;
      }
      save(scenario);
      navigate('/saved', { replace: true });
    }, 600);
  };
  return (
    <div className="page">
      <PageHeading
        title="Review this plan"
        description="Check the dates, costs and assumptions before you save."
      />
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
              <p>
                Stores a snapshot of this comparison and your sample answers in
                this browser.
              </p>
            </div>
            <div className="check-point">
              <Check size={18} />
              <p>
                Makes the selected plan available in My plan and records the
                save in Activity.
              </p>
            </div>
            <p className="muted small">
              It doesn't book treatment, submit a claim, contact anyone or
              consume insurance benefits.
            </p>
          </Card>
          <Card>
            <h3>Based on your confirmed details</h3>
            <Row label="Coverage" value="Sample individual PPO" />
            <Row label="Procedure scope" value="Two fillings and a crown" />
            <Row
              label="Reported paid this year"
              value={money(
                state.input!.planYears['py-2026'].insurerAlreadyPaidCents!,
              )}
            />
            <Row
              label="Input revision"
              value={scenario.estimate.caseRevision}
            />
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
            <span>
              Save this fictional plan and my answers in this browser.
            </span>
          </label>
          <Button
            className="full"
            icon={Check}
            disabled={!consent}
            onClick={submit}
          >
            Save this plan
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
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dentistQuestion);
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
      <blockquote>{dentistQuestion}</blockquote>
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
            value={dentistQuestion}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      )}
    </Card>
  );
}
export function ReminderCard() {
  const { state, setReminder } = useDemo();
  const [date, setDate] = useState('2026-11-01');
  const [error, setError] = useState('');
  return (
    <Card className="stack">
      <div className="section-title">
        <Bell size={20} />
        <h3>Demo reminder</h3>
        <Badge>Simulated</Badge>
      </div>
      <p className="small muted">
        Kept in this browser only. No notification will be sent.
      </p>
      {state.reminder ? (
        <>
          <Notice>
            Demo reminder saved for {dateLabel(state.reminder)} (simulated).
          </Notice>
          <div>
            <Button variant="secondary" onClick={() => setReminder(null)}>
              Remove reminder
            </Button>
          </div>
        </>
      ) : (
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || date < '2026-10-03' || date > '2027-12-31') {
              setError(
                'Choose a date from October 3, 2026 through December 31, 2027.',
              );
              return;
            }
            setError('');
            setReminder(date);
          }}
        >
          <Field label="Remind me on" error={error}>
            <input
              type="date"
              min="2026-10-03"
              max="2027-12-31"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary">
            Save demo reminder
          </Button>
        </form>
      )}
    </Card>
  );
}
export function SavedPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  if (!state.saved)
    return (
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
  const scenario = state.saved.scenario;
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
        <Badge tone="green">Saved locally · Sample data</Badge>
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
          Saving preserves your plan. It doesn't book treatment, submit a claim
          or use benefits.
        </p>
        <Button
          variant="secondary"
          onClick={() => navigate('/details?saved=1')}
        >
          View saved details
        </Button>
      </Card>
      <QuestionCard />
      <ReminderCard />
      <FooterActions>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
        <Button onClick={() => navigate('/my-plan')}>View My plan</Button>
      </FooterActions>
    </div>
  );
}
