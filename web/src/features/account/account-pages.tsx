import type {
  DentalCase,
  LedgerEvent,
  SavedStrategy,
} from '@actionbridge/contracts';
import { ClipboardList, History, LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  dateLabel,
  money,
  scenarioTitle,
  treatmentTitle,
} from '../../domain/model';
import { isSampleCase } from '../../domain/provenance';
import { asApiError, type ApiError } from '../../services/api';
import { useApi, useAuth } from '../../state/auth';
import { useCase } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';
import { ledgerTitle, PlanHistory, QuestionCard } from '../saved/saved-pages';

type Summary = { record: DentalCase; saved: SavedStrategy | null };

/** Loads the user's recent cases (IDs kept in this browser) from the API, newest first. */
function useSummaries(ids: string[], limit: number) {
  const api = useApi();
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const key = ids.slice(0, limit).join(',');
  useEffect(() => {
    let live = true;
    setError(null);
    const wanted = key ? key.split(',') : [];
    void Promise.all(
      wanted.map(async (id): Promise<Summary | null> => {
        try {
          const [record, strategies] = await Promise.all([
            api.getCase(id),
            api.listStrategies(id).catch(() => ({ strategies: [] })),
          ]);
          return { record, saved: strategies.strategies[0] ?? null };
        } catch (caught) {
          const failure = asApiError(caught);
          if (failure.code !== 'NOT_FOUND' && live) setError(failure);
          return null;
        }
      }),
    ).then((found) => {
      if (live)
        setSummaries(
          found
            .filter((s): s is Summary => s !== null)
            .sort((a, b) =>
              b.record.updatedAt.localeCompare(a.record.updatedAt),
            ),
        );
    });
    return () => {
      live = false;
    };
  }, [api, key]);
  return { summaries, error };
}

function CaseList({ limit = 10 }: { limit?: number }) {
  const { recent, open } = useCase();
  const navigate = useNavigate();
  const { summaries, error } = useSummaries(recent, limit);
  if (error) return <ApiNotice error={error} />;
  if (!summaries)
    return (
      <p className="muted small" role="status">
        Loading your cases…
      </p>
    );
  if (summaries.length === 0) return <p className="muted">No cases yet.</p>;
  return (
    <div className="stack">
      {summaries.map(({ record, saved }) => {
        const changed = !!saved && saved.caseRevision !== record.caseRevision;
        const status = changed
          ? 'Details changed'
          : saved
            ? 'Saved plan'
            : record.procedures.length === 0
              ? 'Not started'
              : record.status === 'draft'
                ? 'Needs information'
                : 'Ready to compare';
        return (
          <Card className="case-history-card" key={record.caseId}>
            <div className="section-title">
              <h3>
                {record.procedures.length
                  ? treatmentTitle(record)
                  : 'New estimate'}
              </h3>
              <Badge
                tone={
                  changed || status === 'Needs information'
                    ? 'warning'
                    : saved
                      ? 'green'
                      : undefined
                }
              >
                {status}
              </Badge>
            </div>
            <p className="small muted">
              {isSampleCase(record) ? 'Sample case' : 'Your case'} · Updated{' '}
              {new Date(record.updatedAt).toLocaleString('en-US')}
            </p>
            {saved && (
              <Row
                label="Saved patient estimate"
                value={money(saved.scenario.estimate.totals.patientPaysCents)}
              />
            )}
            <Button
              variant="secondary"
              onClick={() => {
                open(record.caseId);
                navigate(
                  saved && !changed
                    ? '/saved'
                    : record.procedures.length
                      ? '/facts'
                      : '/',
                );
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
  const { record, saved, loading, recent } = useCase();
  const navigate = useNavigate();
  if (loading && !record)
    return (
      <div className="page narrow centered" role="status">
        <Orb size={120} active />
      </div>
    );
  if (!saved || !record)
    return recent.length ? (
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
    ) : (
      <div className="page medium">
        <EmptyState
          icon={ClipboardList}
          title="No saved plan yet"
          description="When you save a plan, it appears here with its costs, dates and assumptions."
          action={
            <Button onClick={() => navigate('/')}>Start an estimate</Button>
          }
        />
      </div>
    );
  const scenario = saved.scenario;
  const changed = saved.caseRevision !== record.caseRevision;
  return (
    <div className="page medium">
      <PageHeading
        eyebrow="Your saved plan"
        title={scenarioTitle(scenario)}
        description={`${treatmentTitle(record)}. Your selected estimate and next steps, in one place.`}
      />
      <Card>
        <div className="section-title">
          <Badge tone="green">Saved to your account</Badge>
          <span className="small muted">
            Saved{' '}
            {new Date(saved.savedAt).toLocaleDateString('en-US', {
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
              record.procedures.find((p) => p.id === s.procedureId)?.label ??
              'Treatment'
            }
            value={dateLabel(s.date)}
          />
        ))}
        {changed && (
          <Notice tone="warning">
            Your case details changed after this plan was saved. Compare again
            before relying on these costs.
          </Notice>
        )}
        <div className="actions">
          <Button onClick={() => navigate('/details?saved=1')}>
            Open details
          </Button>
          <Button variant="secondary" onClick={() => navigate('/facts')}>
            Edit or compare again
          </Button>
        </div>
      </Card>
      <QuestionCard />
      <PlanHistory />
      <Button variant="ghost" onClick={() => navigate('/activity')}>
        See all cases in Activity
      </Button>
    </div>
  );
}

/** Recorded actions across the user's recent cases, from the server ledger. */
export function ActivityPage() {
  const api = useApi();
  const { recent } = useCase();
  const navigate = useNavigate();
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const key = recent.slice(0, 5).join(',');
  useEffect(() => {
    let live = true;
    const ids = key ? key.split(',') : [];
    void Promise.all(
      ids.map((id) =>
        api
          .ledger(id)
          .then((p) => p.events)
          .catch(() => [] as LedgerEvent[]),
      ),
    ).then((pages) => {
      if (live)
        setEvents(
          pages
            .flat()
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 50),
        );
    });
    return () => {
      live = false;
    };
  }, [api, key]);
  return (
    <div className="page medium">
      <PageHeading
        title="Your activity"
        description="Your cases and what happened to them, newest first."
      />
      {recent.length === 0 ? (
        <EmptyState
          icon={History}
          title="Your next steps will appear here"
          description="Start a case from Home. Your confirmed details and saved plans will create an activity trail."
          action={<Button onClick={() => navigate('/')}>Start on Home</Button>}
        />
      ) : (
        <>
          <h3>Your cases</h3>
          <CaseList />
          <h3>Recent actions</h3>
          {!events ? (
            <p className="muted small" role="status">
              Loading activity…
            </p>
          ) : (
            <ol className="activity-list">
              {events.map((event) => (
                <li key={event.eventId}>
                  <Card>
                    <div className="activity-heading">
                      <span className="activity-dot" />
                      <strong>{ledgerTitle(event)}</strong>
                      <time className="small muted" dateTime={event.at}>
                        {new Date(event.at).toLocaleString('en-US')}
                      </time>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { session, rename, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(session?.name ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!session) return null;
  return (
    <div className="page narrow">
      <PageHeading
        title="Your profile"
        description="Your account and how your data is handled."
      />
      <Card className="stack">
        <div className="profile-identity">
          <span className="avatar large">
            {session.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h3>{session.name}</h3>
            <p className="muted small">{session.email}</p>
          </div>
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
            setMessage('Display name saved in this browser.');
            setError('');
          }}
        >
          <Field
            label="Display name"
            error={error}
            hint="Shown only in this browser."
          >
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
        <Row label="Email" value={session.email} />
      </Card>
      <Card>
        <h3>About your data</h3>
        <p className="muted">
          Your cases, answers and saved plans are stored in your account.
          Uploaded documents and voice notes are read once and then deleted.
          Nothing is shared with your dentist or insurer.
        </p>
        <p className="small muted">
          This browser remembers only which cases you opened. Signing out ends
          your session here.
        </p>
      </Card>
      <div className="actions">
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={() => {
            void signOut();
            navigate('/sign-in', { replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
