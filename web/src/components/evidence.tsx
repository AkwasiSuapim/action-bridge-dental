import { BookOpen, FileText, ShieldCheck } from 'lucide-react';
import { Badge, Card, Dialog, Row } from './ui';
import type { DentalCaseInput } from '@actionbridge/contracts';
import type { Provenance } from '../domain/model';
import { useDemo } from '../state/demo-store';
export function Evidence({
  onClose,
  input,
  provenance,
}: {
  onClose: () => void;
  input?: DentalCaseInput;
  provenance?: Provenance;
}) {
  const { state } = useDemo();
  const record = input ?? state.input;
  const answers = provenance ?? state.provenance;
  const sample = record?.procedures.some(
    (p) => p.timingSource === 'fictional_dentist_supplied',
  );
  return (
    <Dialog title="Sources" onClose={onClose} drawer>
      <p className="muted">
        What we used, where it came from, and what still needs confirmation.
      </p>
      <Badge tone="green">
        {sample
          ? 'Sample evidence · Fictional documents'
          : 'Manual demo case · Unverified answers'}
      </Badge>
      {Object.keys(answers).length > 0 && (
        <Card>
          <h3>Provided by you</h3>
          <p className="muted small">
            Your latest entered or corrected values. Origin and confirmation do
            not mean insurer verification.
          </p>
          {Object.entries(answers).map(([path, fact]) => (
            <div key={path}>
              <Row label={fact.label} value={fact.value} />
              <span className="small muted">
                Updated {new Date(fact.recordedAt).toLocaleString('en-US')}
              </span>
            </div>
          ))}
          <Badge>Provided by you · Not insurer verified</Badge>
        </Card>
      )}
      {sample && (
        <>
          <Card>
            <div className="section-title">
              <FileText size={20} />
              <h3>Jordan's treatment estimate</h3>
            </div>
            <p className="small muted">
              Sample document · Page 1 · Treatment fees
            </p>
            <blockquote>
              Two basic fillings at $250 each. One crown at $1,000. Total quoted
              treatment: $1,500.
            </blockquote>
            <Row
              label="Billed and allowed amounts"
              value="Equal in this sample"
            />
            <Badge>From sample document</Badge>
          </Card>
          <Card>
            <div className="section-title">
              <BookOpen size={20} />
              <h3>Sample benefits summary</h3>
            </div>
            <p className="small muted">Fictional individual PPO · Page 2</p>
            <blockquote>
              Annual insurer maximum: $800. Individual deductible: $50. Basic
              services: 80%; major services: 50%, after the deductible.
            </blockquote>
            <Row
              label="Reported 2026 insurer payments"
              value="$500 in the original sample"
            />
            <Badge>From sample document</Badge>
          </Card>
          <Card>
            <div className="section-title">
              <ShieldCheck size={20} />
              <h3>Dentist's timing instruction</h3>
            </div>
            <p>
              The fictional crown window is November 12, 2026 to January 15,
              2027. Fillings remain on November 10 and 11.
            </p>
            <Badge>Sample dentist-supplied window</Badge>
          </Card>
        </>
      )}
      <Card>
        <h3>Assumed for comparison</h3>
        <p className="muted">
          {record &&
          Object.values(record.planYears).some(
            (y) => y.sourceStatus === 'explicit_unchanged_plan_assumption',
          )
            ? 'Next-year coverage, maximum, deductible and treatment fees are assumed unchanged. '
            : ''}
          No other claims consume these balances. The supported model assumes
          covered services and deductible-before-coinsurance unless a coverage
          issue prevents estimation.
        </p>
        <Badge tone="assumed">Assumed · Requires confirmation</Badge>
      </Card>
      <p className="small muted">
        These excerpts are fictional. Nothing has been verified with an insurer.
        Uploaded files are never used as evidence for sample calculations.
      </p>
    </Dialog>
  );
}
