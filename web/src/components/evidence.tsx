import {
  BookOpen,
  FileText,
  MessageSquareQuote,
  ShieldCheck,
} from 'lucide-react';
import { fieldLabel } from '../domain/case-fields';
import {
  evidenceGroups,
  isSampleCase,
  SOURCE_LABEL,
} from '../domain/provenance';
import { useCase } from '../state/case-store';
import { Badge, Card, Dialog, Row } from './ui';

/**
 * Sources drawer: what was used and where it came from, read from the case's server-recorded
 * source facts. Quotes are exact words from what the user shared (documents are deleted after
 * reading). Origin is never insurer verification.
 */
export function Evidence({ onClose }: { onClose: () => void }) {
  const { record } = useCase();
  if (!record) return null;
  const sample = isSampleCase(record);
  const { quoted, entered, assumptions } = evidenceGroups(record);
  return (
    <Dialog title="Sources" onClose={onClose} drawer>
      <p className="muted">
        What I used, where it came from, and what still needs confirmation.
      </p>
      {quoted.length > 0 && (
        <Card>
          <div className="section-title">
            <MessageSquareQuote size={20} />
            <h3>Quoted from what you shared</h3>
          </div>
          <p className="muted small">
            Each value was found in these exact words and confirmed by you
            before it was used.
          </p>
          {quoted.map((q) => (
            <div className="evidence-quote" key={`${q.kind}|${q.quote}`}>
              <blockquote>{q.quote}</blockquote>
              <div className="actions">
                <Badge tone="green">{SOURCE_LABEL[q.kind]}</Badge>
                <span className="small muted">
                  {[...new Set(q.paths.map((p) => fieldLabel(record, p)))]
                    .slice(0, 3)
                    .join(' · ')}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}
      {entered.length > 0 && (
        <Card>
          <h3>Provided by you</h3>
          <p className="muted small">
            Values you entered or corrected. Not verified with your insurer.
          </p>
          {entered.map((fact) => (
            <div key={fact.id}>
              <Row
                label={
                  fact.location?.section ?? fieldLabel(record, fact.fieldPath)
                }
                value={String(fact.value ?? 'Unknown')}
              />
              <span className="small muted">
                Updated {new Date(fact.recordedAt).toLocaleString('en-US')}
              </span>
            </div>
          ))}
        </Card>
      )}
      {sample && (
        <>
          <Card>
            <div className="section-title">
              <FileText size={20} />
              <h3>Jordan's treatment estimate</h3>
            </div>
            <p className="small muted">Sample document · Treatment fees</p>
            <blockquote>
              Two basic fillings at $250 each. One crown at $1,000. Total quoted
              treatment: $1,500.
            </blockquote>
            <Badge>Sample data</Badge>
          </Card>
          <Card>
            <div className="section-title">
              <BookOpen size={20} />
              <h3>Sample benefits summary</h3>
            </div>
            <p className="small muted">Fictional individual PPO</p>
            <blockquote>
              Annual insurer maximum: $800. Individual deductible: $50. Basic
              services: 80%; major services: 50%, after the deductible.
            </blockquote>
            <Badge>Sample data</Badge>
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
          {Object.values(record.planYears).some(
            (y) => y.sourceStatus === 'explicit_unchanged_plan_assumption',
          )
            ? 'Next-year coverage, maximum, deductible and treatment fees are assumed unchanged. '
            : ''}
          {assumptions.length > 0
            ? 'You pay the deductible before your plan’s percentage applies, and these services are covered with no waiting period, exclusion or frequency limit — unless you told me otherwise. '
            : ''}
          No other claims use these balances.
        </p>
        <Badge tone="assumed">Assumed · Requires confirmation</Badge>
      </Card>
      <p className="small muted">
        Nothing here has been verified with an insurer.
      </p>
    </Dialog>
  );
}
