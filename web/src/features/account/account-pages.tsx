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
import { dateLabel, money, scenarioTitle } from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import { useJob } from '../../state/job-store';
import { QuestionCard, ReminderCard } from '../saved/saved-pages';

export function MyPlanPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
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
        description="Two fillings and a crown. Your selected estimate and next steps, in one place."
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
        <Row label="Fillings" value="Nov 10 and 11, 2026" />
        <Row
          label="Crown"
          value={dateLabel(
            scenario.schedule.find((s) => s.procedureId === 'crown-1')!.date,
          )}
        />
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
  const { state, rename, signOut, reset } = useDemo();
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
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={() => {
            cancel();
            signOut();
            navigate('/login', { replace: true });
          }}
        >
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
