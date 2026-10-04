import { BookOpen, ClipboardList, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Evidence } from '../../components/evidence';
import {
  Badge,
  Button,
  Card,
  Disclosure,
  EmptyState,
  FooterActions,
  Notice,
  PageHeading,
  Row,
} from '../../components/ui';
import { money, treatmentTitle } from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import {
  BenefitYears,
  ProcedureTable,
  ScenarioCard,
} from './financial-components';
import { useComparison } from './use-comparison';
import { SelfPay } from './self-pay';

export function OptionsPage() {
  const { state, select } = useDemo();
  const { comparison, error, scenarios } = useComparison();
  const navigate = useNavigate();
  const [sources, setSources] = useState(false);
  const [mode, setMode] = useState<'insured' | 'self-pay'>('insured');
  const selected =
    scenarios.find((s) => s.scenarioId === state.selectedId) ?? scenarios[0];
  if (!comparison || !selected)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title={state.input ? 'Recalculation needed' : 'No comparison yet'}
          description={
            error ??
            'Review your information and confirm the missing details before comparing costs.'
          }
          action={
            <Button onClick={() => navigate(state.input ? '/facts' : '/')}>
              {state.input ? 'Review information' : 'Start on Home'}
            </Button>
          }
        />
      </div>
    );
  const alternative = comparison.alternatives[0];
  return (
    <div className="page options-page">
      <PageHeading
        eyebrow={`Sample case · ${state.session?.name}`}
        title={treatmentTitle(state.input)}
        description="Compare treatment timing against your benefit years. Estimates only."
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
                  This depends on the dentist-supplied window and the entered
                  future coverage and prices.
                </strong>{' '}
                ActionBridge doesn't decide whether care can wait.
              </p>
            </div>
          ) : (
            <Notice>
              {comparison.outcome === 'no_flexible_timing'
                ? 'No dentist-supplied flexible window is available. We show your original dates without moving treatment.'
                : comparison.outcome === 'comparison_incomplete'
                  ? 'The original estimate is available, but an alternative could not be compared. Check future benefit dates and balances.'
                  : 'No lower-cost feasible alternative was found for these details. The original estimate still helps you understand coverage.'}
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
                    {Object.values(state.input!.planYears).some(
                      (y) =>
                        y.sourceStatus === 'explicit_unchanged_plan_assumption',
                    )
                      ? 'Assumed unchanged'
                      : 'Entered terms · Unverified'}
                  </Badge>
                }
              />
              <Row
                label="Dentist-permitted treatment dates"
                value={
                  <Badge>
                    {state.origin === 'sample'
                      ? 'Sample instruction'
                      : 'No new window inferred'}
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
                    {state.origin === 'sample'
                      ? 'Sample plan and your edits'
                      : 'Provided by you'}
                  </Badge>
                }
              />
            </Disclosure>
          </Card>
          <FooterActions note="Same procedure scope. Financial differences depend on timing and assumptions.">
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
        <SelfPay scenarios={scenarios} />
      )}
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
}
