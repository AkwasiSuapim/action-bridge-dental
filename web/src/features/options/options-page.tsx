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
    return (
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

  const alternative = comparison.alternatives[0];
  const assumedNextYear = Object.values(record.planYears).some(
    (y) => y.sourceStatus === 'explicit_unchanged_plan_assumption',
  );
  return (
    <div className="page options-page">
      <PageHeading
        eyebrow={`${isSampleCase(record) ? 'Sample case' : 'Your case'} · Estimated`}
        title={treatmentTitle(record)}
        description="Compare treatment timing against your benefit years."
        actions={
          <>
            <div className="segmented" aria-label="How you'll pay">
              {(['insured', 'self-pay'] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  className={mode === m ? 'active' : ''}
                  onClick={() => setMode(m)}
                >
                  {m === 'insured' ? 'Using my plan' : 'Self-pay'}
                </button>
              ))}
            </div>
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
      {mode === 'insured' ? (
        <>
          <fieldset className="scenario-grid">
            <legend className="visually-hidden">Choose a schedule</legend>
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.scenarioId}
                scenario={scenario}
                selected={selected.scenarioId === scenario.scenarioId}
                onSelect={() => select(scenario.scenarioId)}
                onSources={() => setSources(true)}
              />
            ))}
          </fieldset>
          {alternative ? (
            <div className="difference-banner">
              <div>
                <p className="eyebrow">Conditional estimated difference</p>
                <strong>
                  {money(alternative.differenceFromBaselineCents)}
                </strong>
              </div>
              <p>
                Using the alternative permitted schedule could lower your
                estimated cost.{' '}
                <strong>
                  This depends on the dentist-supplied window and next year’s
                  coverage and prices.
                </strong>{' '}
                ActionBridge doesn't decide whether care can wait.
              </p>
            </div>
          ) : (
            <Notice>
              {comparison.outcome === 'no_flexible_timing'
                ? 'No dentist-supplied flexible window is available. I show your original dates without moving treatment.'
                : comparison.outcome === 'comparison_incomplete'
                  ? 'The original estimate is available, but an alternative could not be compared. Check future benefit dates and balances.'
                  : 'No lower-cost permitted alternative was found for these details. The original estimate still shows what your plan covers.'}
            </Notice>
          )}
          {comparison.limitations.length > 0 && (
            <Notice>
              {comparison.limitations.map((l) => l.message).join(' ')}
            </Notice>
          )}
          <div className="financial-grid">
            <ProcedureTable
              scenario={selected}
              onSources={() => setSources(true)}
            />
            <BenefitYears scenario={selected} />
          </div>
          <Card>
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
                label="Dentist-permitted treatment dates"
                value={
                  <Badge>
                    {isSampleCase(record)
                      ? 'Sample instruction'
                      : 'Only dates your dentist gave'}
                  </Badge>
                }
              />
              <Row
                label="Additional claims before treatment"
                value={<Badge tone="assumed">Not modeled</Badge>}
              />
              <Row
                label="Network, eligibility and allowed amount"
                value={
                  <Badge>
                    {isSampleCase(record)
                      ? 'Sample plan and your edits'
                      : 'Provided by you'}
                  </Badge>
                }
              />
            </Disclosure>
          </Card>
          <FooterActions note="Same procedure scope. Differences depend on timing and assumptions.">
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
        <SelfPay coverage={data.coverage} scenarios={scenarios} />
      )}
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
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
