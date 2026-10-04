import { BookOpen, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Evidence } from '../../components/evidence';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FooterActions,
  Notice,
  PageHeading,
} from '../../components/ui';
import { money, scenarioTitle } from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import {
  BenefitYears,
  Conditions,
  ProcedureDetails,
  TreatmentTimeline,
} from '../options/financial-components';
import { useComparison } from '../options/use-comparison';
export function DetailsPage() {
  const { state, select } = useDemo();
  const { scenarios } = useComparison();
  const [params] = useSearchParams();
  const saved = params.get('saved') === '1';
  const navigate = useNavigate();
  const [sources, setSources] = useState(false);
  const scenario = saved
    ? state.saved?.scenario
    : (scenarios.find((s) => s.scenarioId === state.selectedId) ??
      scenarios[0]);
  if (!scenario)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="No plan details yet"
          description="Compare your options first, then open details for the one you choose."
          action={
            <Button onClick={() => navigate('/options')}>Go to options</Button>
          }
        />
      </div>
    );
  const stale =
    saved && state.saved?.input.caseRevision !== state.input?.caseRevision;
  return (
    <div className="page">
      <PageHeading
        eyebrow={
          saved ? 'Your saved snapshot' : 'Your selected option · Estimated'
        }
        title="The details behind your plan"
        description="Treatment dates, itemized costs and the rules behind each number."
        actions={
          <Button
            variant="secondary"
            icon={BookOpen}
            onClick={() => setSources(true)}
          >
            All sources
          </Button>
        }
      />
      {stale && (
        <Notice tone="warning">
          Your case changed after saving. This is the saved snapshot; recompare
          to update it.
        </Notice>
      )}
      <Card className="plan-summary">
        <div>
          <span className="muted small">Selected option</span>
          <h3>{scenarioTitle(scenario)}</h3>
          <Badge>Sample data</Badge>
        </div>
        <div>
          <span className="muted small">Estimated patient cost</span>
          <strong>{money(scenario.estimate.totals.patientPaysCents)}</strong>
        </div>
        <div>
          <span className="muted small">Insurer contribution</span>
          <strong>{money(scenario.estimate.totals.insurerPaysCents)}</strong>
          <small className="muted">
            {scenario.kind === 'alternative'
              ? 'Across two benefit years'
              : 'Current benefit year'}
          </small>
        </div>
        <div>
          <span className="muted small">Compared with baseline</span>
          <strong>
            {scenario.differenceFromBaselineCents
              ? `${money(scenario.differenceFromBaselineCents)} lower`
              : 'Baseline option'}
          </strong>
          <small className="muted">
            Subject to plan and timing assumptions
          </small>
        </div>
      </Card>
      <div className="financial-grid">
        <div className="stack">
          <TreatmentTimeline
            scenario={scenario}
            input={saved ? state.saved!.input : state.input!}
          />
          <ProcedureDetails
            scenario={scenario}
            input={saved ? state.saved!.input : state.input!}
            onSources={() => setSources(true)}
          />
        </div>
        <div className="stack">
          <BenefitYears
            scenario={scenario}
            input={saved ? state.saved!.input : state.input!}
          />
          <Conditions />
          <Card>
            <h3>How to read the labels</h3>
            <div className="label-explanation">
              <Badge>From sample document</Badge>
              <p className="small muted">
                Fictional plan terms and treatment fees.
              </p>
              <Badge>Provided by you</Badge>
              <p className="small muted">
                Entered or corrected information; not insurer verification.
              </p>
              <Badge tone="assumed">Assumed for comparison</Badge>
              <p className="small muted">
                A condition that needs confirmation before acting.
              </p>
            </div>
          </Card>
        </div>
      </div>
      <FooterActions>
        <Button
          variant="secondary"
          onClick={() => navigate(saved ? '/my-plan' : '/options')}
        >
          {saved ? 'Back to My plan' : 'Back to options'}
        </Button>
        <Button
          onClick={() => {
            if (stale) {
              navigate('/facts');
              return;
            }
            select(scenario.scenarioId);
            navigate('/review');
          }}
        >
          {stale ? 'Recompare current details' : 'Review this plan'}
        </Button>
      </FooterActions>
      {sources && (
        <Evidence
          input={saved ? state.saved!.input : state.input!}
          provenance={saved ? state.saved!.provenance : state.provenance}
          onClose={() => setSources(false)}
        />
      )}
    </div>
  );
}
