import {
  plainDate,
  plainSummary,
  type DentalCase,
  type PlainSummary,
  type Scenario,
} from '@actionbridge/contracts';
import { BookOpen, ClipboardList, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Evidence } from '../../components/evidence';
import {
  Badge,
  Button,
  Card,
  Disclosure,
  EmptyState,
  FooterActions,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import { money, treatmentTitle } from '../../domain/model';
import { isSampleCase } from '../../domain/provenance';
import { useCase, useResults } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';
import {
  BenefitYears,
  ProcedureTable,
  ScenarioCard,
} from './financial-components';
import { SelfPay } from './self-pay';
import { ListenButton } from '../../components/listen';
import { useApi } from '../../state/auth';
import { useAutoRead } from '../../voice/voice';
import { ReminderActions } from '../saved/reminder';

/**
 * Server-calculated timing options for the current revision, plus the self-pay comparison.
 * Results for an older revision are never shown as current.
 */
export function OptionsPage() {
  const { record, loading, select } = useCase();
  const { status, error, data, comparison, scenarios, selected, retry } =
    useResults();
  const navigate = useNavigate();
  const [sources, setSources] = useState(false);
  // The view lives in the URL so it survives the recalculation after a quote is saved.
  const [params, setParams] = useSearchParams();
  const mode: 'insured' | 'self-pay' =
    params.get('view') === 'self-pay' ? 'self-pay' : 'insured';
  const setMode = (next: 'insured' | 'self-pay') =>
    setParams(next === 'self-pay' ? { view: 'self-pay' } : {}, {
      replace: true,
    });

  if (!record)
    return loading ? (
      <Calculating />
    ) : (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="No comparison yet"
          description="Start a case on Home, then confirm your details to compare costs."
          action={<Button onClick={() => navigate('/')}>Start on Home</Button>}
        />
      </div>
    );
  if (status === 'error' && error)
    return error.code === 'INCONSISTENT_INPUT' ? (
      // Contradictory numbers: retrying can't help, fixing the detail can.
      <div className="page narrow">
        <PageHeading
          title="Two details don’t add up"
          description="I can’t calculate until this is fixed. Nothing was guessed."
        />
        <ApiNotice error={error} />
        <FooterActions>
          <Button onClick={() => navigate('/facts')}>Fix your details</Button>
        </FooterActions>
      </div>
    ) : (
      <div className="page narrow">
        <ApiNotice error={error} onRetry={retry} />
      </div>
    );
  if (!data) return <Calculating />;

  if (data.estimate.status === 'needs_information')
    return (
      <div className="page medium">
        <PageHeading
          title="A few details are missing"
          description="I need these before I can estimate. Anything you don’t know, I’ll turn into a question for your dentist or insurer."
        />
        <Card>
          <ul className="hint-list">
            {data.estimate.missing.map((fact) => (
              <li key={fact.fieldPath}>{fact.message}</li>
            ))}
          </ul>
        </Card>
        <FooterActions>
          <Button variant="secondary" onClick={() => navigate('/facts')}>
            Review your information
          </Button>
          <Button onClick={() => navigate('/questions')}>
            Answer the missing details
          </Button>
        </FooterActions>
      </div>
    );

  if (!comparison || !selected) {
    const limitations =
      data.estimate.status === 'unsupported'
        ? data.estimate.limitations
        : data.scenarios.status === 'unsupported'
          ? data.scenarios.limitations
          : [];
    const notInsured =
      limitations.some((l) => l.code === 'NOT_INSURED') ||
      record.coverageMode === 'self_pay';
    return (
      <div className="page medium">
        <PageHeading
          title={
            notInsured
              ? 'Your self-pay estimate'
              : 'I can’t estimate this plan yet'
          }
          description={treatmentTitle(record)}
        />
        {!notInsured && (
          <Notice tone="warning">
            {limitations.map((l) => l.message).join(' ') ||
              'Some plan rules aren’t supported yet.'}
          </Notice>
        )}
        <SelfPay coverage={data.coverage} />
        <FooterActions>
          <Button variant="secondary" onClick={() => navigate('/facts')}>
            Edit details
          </Button>
        </FooterActions>
      </div>
    );
  }

  const alternative = comparison.alternatives[0] ?? null;
  const summary = plainSummary({
    comparison: comparison.baseline,
    alternative,
    outcome: comparison.outcome,
    procedures: record.procedures,
    selfPay:
      data.coverage.selfPay.status === 'available'
        ? {
            totalCents: data.coverage.selfPay.totalCents,
            minusInsuredCents: data.coverage.selfPayMinusInsuredCents,
          }
        : null,
  });
  const assumedNextYear = Object.values(record.planYears).some(
    (y) => y.sourceStatus === 'explicit_unchanged_plan_assumption',
  );
  return (
    <div className="page options-page">
      <PageHeading
        eyebrow={`${isSampleCase(record) ? 'Sample case' : 'Your case'} · Estimated`}
        title={treatmentTitle(record)}
        description="Your choices, what each costs, and what it means."
        actions={
          <>
            <Button
              variant="secondary"
              icon={BookOpen}
              onClick={() => setSources(true)}
            >
              Sources
            </Button>
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => navigate('/facts')}
            >
              Edit details
            </Button>
          </>
        }
      />
      <div className="segmented" aria-label="How you'll pay">
        {(['insured', 'self-pay'] as const).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            className={mode === m ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            {m === 'insured'
              ? 'Using my insurance'
              : 'Paying without insurance'}
          </button>
        ))}
      </div>
      {mode === 'insured' ? (
        <>
          <MeaningCard summary={summary} />
          <BenefitsLeft scenario={comparison.baseline} record={record} />
          <fieldset className="choice-grid">
            <legend className="eyebrow">Your choices</legend>
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.scenarioId}
                scenario={scenario}
                selected={selected.scenarioId === scenario.scenarioId}
                onSelect={() => select(scenario.scenarioId)}
              />
            ))}
          </fieldset>
          <div className="stack">
            <Disclosure title="See the cost breakdown for your choice">
              <ProcedureTable
                scenario={selected}
                onSources={() => setSources(true)}
              />
            </Disclosure>
            <Disclosure title="See how your yearly benefits are used">
              <BenefitYears scenario={selected} />
            </Disclosure>
            <Disclosure title="What could change this estimate?">
              <Row
                label="Next year's coverage and fees"
                value={
                  <Badge tone="assumed">
                    {assumedNextYear
                      ? 'Assumed unchanged'
                      : 'Entered terms · Unverified'}
                  </Badge>
                }
              />
              <Row
                label="Treatment dates"
                value={<Badge>Only dates your dentist allows</Badge>}
              />
              <Row
                label="Other claims before treatment"
                value={<Badge tone="assumed">Not included</Badge>}
              />
              {comparison.limitations.map((l) => (
                <p key={l.code} className="small muted">
                  {l.message}
                </p>
              ))}
            </Disclosure>
          </div>
          <FooterActions note="Same treatment either way. Only the timing and the cost change.">
            <Button variant="secondary" onClick={() => navigate('/details')}>
              View details
            </Button>
            <Button
              onClick={() => {
                select(selected.scenarioId);
                navigate('/review');
              }}
            >
              Review this plan
            </Button>
          </FooterActions>
        </>
      ) : (
        <>
          <p className="term-meaning">
            <strong>Paying without insurance:</strong> you pay the dentist’s
            cash price yourself and don’t use your plan. Some dentists charge
            less for cash, so it’s worth comparing.
          </p>
          <SelfPay coverage={data.coverage} scenarios={scenarios} />
        </>
      )}
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
}

/** The calculator's results in plain words, at the top of the page. */
export function MeaningCard({
  summary,
  title = 'What this means for you',
}: {
  summary: PlainSummary;
  title?: string;
}) {
  const api = useApi();
  // Voice guidance reads this aloud when the page opens.
  useAutoRead(api, summary.speech);
  return (
    <Card className="meaning-card">
      <div className="section-title">
        <h3>{title}</h3>
        <ListenButton text={summary.speech} />
      </div>
      {summary.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </Card>
  );
}

/** "You have $300 of your $800 left this year · resets January 1, 2027." */
export function BenefitsLeft({
  scenario,
  record,
}: {
  scenario: Scenario;
  record: DentalCase;
}) {
  const year = Object.values(scenario.estimate.yearProjections)[0];
  const terms = year ? record.planYears[year.planYearId] : undefined;
  if (!year || !terms) return null;
  const left = Math.max(
    0,
    year.annualMaximumCents - year.reportedInsurerPaidCents,
  );
  return (
    <Card className="benefits-left">
      <div>
        <span className="small muted">Benefits left this year</span>
        <strong>
          {money(left)}{' '}
          <small className="muted">of {money(year.annualMaximumCents)}</small>
        </strong>
        <span className="small muted">
          Unused benefits don’t carry over. They reset on{' '}
          {plainDate(nextDay(terms.endDate))}.
        </span>
      </div>
      <ReminderActions leftCents={left} yearEnd={terms.endDate} />
    </Card>
  );
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function Calculating() {
  return (
    <div
      className="page narrow centered"
      role="status"
      aria-label="Calculating estimated costs"
    >
      <Orb size={140} active />
      <p className="muted">Calculating estimated costs…</p>
    </div>
  );
}
