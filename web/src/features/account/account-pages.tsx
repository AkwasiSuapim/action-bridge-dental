import { ClipboardList, History, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Disclosure,
  EmptyState,
  Field,
  Notice,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  dateLabel,
  money,
  scenarioTitle,
  treatmentTitle,
  type CaseSnapshot,
} from '../../domain/model';
import { useDemo, recentCases } from '../../state/demo-store';
import { nextQuestion } from '../../domain/case-fields';
import { useJob } from '../../state/job-store';
import { useEndSession } from '../../state/session';
import { QuestionCard, ReminderCard, PlanHistory } from '../saved/saved-pages';

function casePath(c: CaseSnapshot) {
  return c.saved && c.saved.input.caseRevision === c.input?.caseRevision
    ? '/details?saved=1'
    : c.comparedRevision === c.input?.caseRevision
      ? '/options'
      : nextQuestion(c.input!) || c.documentNeeded || c.deductibleConflict
        ? '/questions'
        : '/facts';
}
function CaseList({ limit }: { limit?: number }) {
  const { state, openCase } = useDemo();
  const { cancel } = useJob();
  const navigate = useNavigate();
  const cases = recentCases(state).slice(0, limit);
  return (
    <div className="stack">
      {cases.map((c) => {
        const changed =
          !!c.saved && c.saved.input.caseRevision !== c.input?.caseRevision;
        const missing =
          !!nextQuestion(c.input!) || c.documentNeeded || c.deductibleConflict;
        const status = changed
          ? 'Details changed'
          : c.saved
            ? 'Saved plan'
            : missing
              ? 'Needs information'
              : c.comparedRevision === c.input?.caseRevision
                ? 'Comparison ready'
                : 'Ready to compare';
        return (
          <Card className="case-history-card" key={c.caseId}>
            <div className="section-title">
              <h3>{treatmentTitle(c.input)}</h3>
              <Badge
                tone={
                  changed || missing ? 'warning' : c.saved ? 'green' : undefined
                }
              >
                {status}
              </Badge>
            </div>
            <p className="small muted">
              {c.origin === 'sample' ? 'Sample case' : 'Manual demo case'} ·
              Updated {new Date(c.updatedAt).toLocaleString('en-US')}
            </p>
            {c.saved && (
              <Row
                label="Saved patient estimate"
                value={money(c.saved.scenario.estimate.totals.patientPaysCents)}
              />
            )}
            <Button
              variant="secondary"
              onClick={() => {
                cancel();
                openCase(c.caseId!);
                navigate(casePath(c));
              }}
            >
              Resume case
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

export function MyPlanPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  if (!state.saved && (state.input || state.cases.length))
    return (
      <div className="page medium">
        <PageHeading
          title="My plan"
          description="Your most recent case and where to pick it up."
        />
        <CaseList limit={1} />
        <Button variant="ghost" onClick={() => navigate('/activity')}>
          See all cases in Activity
        </Button>
      </div>
    );
  if (!state.saved)
    return (
      <div className="page medium">
        <EmptyState
          icon={ClipboardList}
          title="No saved plan yet"
          description="When you save a plan, it appears here with its costs, dates and assumptions."
          action={
            <Button onClick={() => navigate(state.input ? '/facts' : '/')}>
              {state.input ? 'Continue your case' : 'Start an estimate'}
            </Button>
          }
        />
      </div>
    );
  const scenario = state.saved.scenario;
  const changed = state.saved.input.caseRevision !== state.input?.caseRevision;
  return (
    <div className="page medium">
      <PageHeading
        eyebrow="Your saved plan"
        title={scenarioTitle(scenario)}
        description={`${treatmentTitle(state.saved.input)}. Your selected estimate and next steps, in one place.`}
      />
      <Card>
        <div className="section-title">
          <Badge tone="green">Saved locally</Badge>
          <span className="small muted">
            Saved{' '}
            {new Date(state.saved.savedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <div className="plan-summary compact">
          <div>
            <span className="small muted">Estimated patient cost</span>
            <strong>{money(scenario.estimate.totals.patientPaysCents)}</strong>
          </div>
          <div>
            <span className="small muted">Insurer contribution</span>
            <strong>{money(scenario.estimate.totals.insurerPaysCents)}</strong>
          </div>
        </div>
        {scenario.schedule.map((s) => (
          <Row
            key={s.procedureId}
            label={
              state.saved!.input.procedures.find((p) => p.id === s.procedureId)
                ?.label ?? 'Treatment'
            }
            value={dateLabel(s.date)}
          />
        ))}
        {changed && (
          <Notice tone="warning">
            Your case details changed after this snapshot was saved. Recompare
            before relying on these costs.
          </Notice>
        )}
        <div className="actions">
          <Button onClick={() => navigate('/details?saved=1')}>
            Open details
          </Button>
          <Button variant="secondary" onClick={() => navigate('/facts')}>
            Edit or recompare
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              navigate(
                state.comparedRevision === state.input?.caseRevision
                  ? '/options'
                  : '/facts',
              )
            }
          >
            Resume case
          </Button>
        </div>
      </Card>
      <QuestionCard />
      <ReminderCard />
      <PlanHistory />
      <Button variant="ghost" onClick={() => navigate('/activity')}>
        See all cases in Activity
      </Button>
    </div>
  );
}
export function ActivityPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  return (
    <div className="page medium">
      <PageHeading
        title="Your activity"
        description="Events from your actions in this demo, newest first. Stored only in this browser."
      />
      {(state.input || state.cases.length > 0) && (
        <>
          <h3>Your cases</h3>
          <CaseList />
          <h3>Recent actions</h3>
        </>
      )}
      {state.events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Your next steps will appear here"
          description="Start a case from Home. Your confirmed details, comparisons and saved plan will create an activity trail."
          action={<Button onClick={() => navigate('/')}>Start on Home</Button>}
        />
      ) : (
        <ol className="activity-list">
          {state.events.map((event) => (
            <li key={event.id}>
              <Card>
                <Disclosure
                  title={
                    <div className="activity-heading">
                      <span className="activity-dot" />
                      <strong>{event.title}</strong>
                      <time className="small muted" dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                  }
                >
                  <p className="muted">{event.detail}</p>
                  <p className="small muted">
                    {new Date(event.timestamp).toLocaleString('en-US')}
                  </p>
                </Disclosure>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
export function ProfilePage() {
  const { state, rename, reset } = useDemo();
  const endSession = useEndSession();
  const { cancel } = useJob();
  const navigate = useNavigate();
  const [name, setName] = useState(state.session!.name);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div className="page narrow">
      <PageHeading
        title="Your profile"
        description="Your demo identity and browser data settings."
      />
      <Card className="stack">
        <div className="profile-identity">
          <span className="avatar large">
            {state.session!.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h3>{state.session!.name}</h3>
            <p className="muted small">{state.session!.email}</p>
          </div>
          <Badge>Demo account</Badge>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError('Enter a display name.');
              return;
            }
            rename(name.trim());
            setMessage('Display name saved.');
            setError('');
          }}
        >
          <Field label="Display name" error={error}>
            <input
              value={name}
              maxLength={60}
              autoComplete="name"
              onChange={(e) => {
                setName(e.target.value);
                setMessage('');
              }}
            />
          </Field>
          <div>
            <Button type="submit" icon={UserRound}>
              Save name
            </Button>
          </div>
          {message && (
            <p className="small accent" role="status">
              {message}
            </p>
          )}
        </form>
        <Row label="Email" value={state.session!.email} />
        <p className="small muted">The demo email can't be changed.</p>
      </Card>
      <Card>
        <h3>About demo data</h3>
        <p className="muted">
          Sign-in is simulated. Passwords are never stored. The app does not
          create a real account.
        </p>
        <p className="muted">
          Your fictional case, saved estimate, activity and demo reminder stay
          in this browser. Files and descriptions stay in memory and disappear
          after a reload. No files or audio are sent to a server.
        </p>
        <p className="small muted">
          If browser storage is blocked, the demo continues in memory.
        </p>
      </Card>
      <div className="actions">
        <Button variant="secondary" icon={LogOut} onClick={() => endSession()}>
          Sign out
        </Button>
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          Reset demo
        </Button>
      </div>
      {resetOpen && (
        <Dialog title="Reset the demo?" onClose={() => setResetOpen(false)}>
          <p>
            Your sample case, plan, reminder and activity will be cleared. Any
            running analysis will stop.
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                cancel();
                reset();
                setResetOpen(false);
                navigate('/');
              }}
            >
              Reset demo
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
