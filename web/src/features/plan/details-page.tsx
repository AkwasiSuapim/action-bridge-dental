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
import { isSampleCase } from '../../domain/provenance';
import { useCase, useResults } from '../../state/case-store';
import {
  BenefitYears,
  Conditions,
  ProcedureDetails,
  TreatmentTimeline,
} from '../options/financial-components';
export function DetailsPage() {
  const { record, saved: savedPlan, select } = useCase();
  const { selected } = useResults();
  const [params] = useSearchParams();
  const saved = params.get('saved') === '1';
  const navigate = useNavigate();
  const [sources, setSources] = useState(false);
  const scenario = saved ? savedPlan?.scenario : selected;
  if (!scenario || !record)
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
  const stale = saved && savedPlan?.caseRevision !== record.caseRevision;
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
          {isSampleCase(record) && <Badge>Sample data</Badge>}
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
          <TreatmentTimeline scenario={scenario} input={record} />
          <ProcedureDetails
            scenario={scenario}
            input={record}
            onSources={() => setSources(true)}
          />
        </div>
        <div className="stack">
          <BenefitYears scenario={scenario} input={record} />
          <Conditions />
          <Card>
            <h3>How to read the labels</h3>
            <div className="label-explanation">
              <Badge tone="green">From your document · From your words</Badge>
              <p className="small muted">
                Quoted exactly from what you shared, then confirmed by you.
              </p>
              <Badge>Sample data</Badge>
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
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
}
