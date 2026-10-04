import { CalendarDays } from 'lucide-react';
import type { Scenario } from '@actionbridge/contracts';
import { Badge, Button, Card, Disclosure, Row } from '../../components/ui';
import {
  dateLabel,
  money,
  procedureLabel,
  scenarioTitle,
} from '../../domain/model';

export function ScenarioCard({
  scenario,
  selected,
  onSelect,
  onSources,
}: {
  scenario: Scenario;
  selected: boolean;
  onSelect: () => void;
  onSources: () => void;
}) {
  const crown = scenario.schedule.find((s) => s.procedureId === 'crown-1');
  return (
    <article className={`scenario-card ${selected ? 'selected' : ''}`}>
      <label className="scenario-select">
        <div className="scenario-header">
          <input
            type="radio"
            name="schedule"
            checked={selected}
            onChange={onSelect}
          />
          <div>
            <h3>{scenarioTitle(scenario)}</h3>
            <p className="small muted">
              {scenario.kind === 'baseline'
                ? 'Complete care in the current benefit year'
                : 'Fillings now, crown after your plan resets'}
            </p>
          </div>
          {selected && <Badge tone="green">Selected</Badge>}
        </div>
        <div>
          <span className="scenario-money">
            {money(scenario.estimate.totals.patientPaysCents)}
          </span>
          <p className="muted small">Estimated patient cost</p>
        </div>
        <div className="scenario-facts">
          <Row
            label="Insurer contribution"
            value={
              <>
                {money(scenario.estimate.totals.insurerPaysCents)}
                <small>
                  {scenario.kind === 'baseline'
                    ? 'In 2026'
                    : 'Across both benefit years'}
                </small>
              </>
            }
          />
          <Row label="Fillings" value="Nov 10 and 11, 2026" />
          <Row label="Crown" value={dateLabel(crown?.date ?? '2026-11-12')} />
          <Row label="Procedure scope" value="2 fillings, 1 crown" />
        </div>
        <div className="assumptions">
          <strong className="small">Assumptions</strong>
          <div>
            <span>Covered, in network; billed equals allowed</span>
            <Badge>Sample</Badge>
          </div>
          {scenario.kind === 'alternative' && (
            <>
              <div>
                <span>Next year's coverage and fees unchanged</span>
                <Badge tone="assumed">Assumed</Badge>
              </div>
              <div>
                <span>Crown is within the dentist's window</span>
                <Badge>Sample</Badge>
              </div>
            </>
          )}
          <div>
            <span>No other claims use these balances</span>
            <Badge tone="assumed">Assumed</Badge>
          </div>
        </div>
      </label>
      <div className="scenario-card-footer">
        <Button variant="secondary" onClick={onSources}>
          View sources
        </Button>
      </div>
    </article>
  );
}
export function BenefitYears({ scenario }: { scenario: Scenario }) {
  return (
    <Card className="benefit-card">
      <h3>Benefit-year usage</h3>
      <p className="muted small">
        Each year has its own maximum. They're never combined.
      </p>
      {Object.values(scenario.estimate.yearProjections).map((year) => (
        <div className="year-usage" key={year.planYearId}>
          <div className="year-heading">
            <strong>{year.planYearId.replace('py-', '')}</strong>
            <span className="small muted">
              {money(year.annualMaximumCents)} maximum
            </span>
          </div>
          <div className="benefit-bar" aria-hidden="true">
            <span
              className="reported"
              style={{
                width: `${year.annualMaximumCents ? (year.reportedInsurerPaidCents / year.annualMaximumCents) * 100 : 0}%`,
              }}
            />
            <span
              className="projected"
              style={{
                width: `${year.annualMaximumCents ? ((year.projectedTotalInsurerPaidCents - year.reportedInsurerPaidCents) / year.annualMaximumCents) * 100 : 0}%`,
              }}
            />
          </div>
          <Row
            label={
              <>
                <i className="legend-dot reported" />
                Reported paid
              </>
            }
            value={money(year.reportedInsurerPaidCents)}
          />
          <Row
            label={
              <>
                <i className="legend-dot projected" />
                Projected with this option
              </>
            }
            value={money(
              year.projectedTotalInsurerPaidCents -
                year.reportedInsurerPaidCents,
            )}
          />
          <Row
            label={
              <>
                <i className="legend-dot remaining" />
                Remaining after projection
              </>
            }
            value={money(year.remainingMaximumCents)}
          />
          {year.assumedPlanTerms && (
            <Badge tone="assumed">Next-year plan assumed unchanged</Badge>
          )}
        </div>
      ))}
      <p className="muted small">
        Comparing or saving doesn't consume benefits. Reported paid is separate
        from planned usage.
      </p>
    </Card>
  );
}
export function ProcedureTable({
  scenario,
  onSources,
}: {
  scenario: Scenario;
  onSources: () => void;
}) {
  return (
    <Card className="procedure-table-card">
      <div className="section-title">
        <h3>Procedure breakdown</h3>
        <span className="small muted">Selected option</span>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        aria-label="Procedure cost table"
      >
        <table>
          <caption className="visually-hidden">
            Costs for {scenarioTitle(scenario)}
          </caption>
          <thead>
            <tr>
              <th>Procedure</th>
              <th>Date</th>
              <th>Dentist fee</th>
              <th>Insurer pays</th>
              <th>You pay</th>
            </tr>
          </thead>
          <tbody>
            {scenario.estimate.lines.map((line) => (
              <tr key={line.procedureId}>
                <th scope="row">{procedureLabel(line.procedureId)}</th>
                <td>{dateLabel(line.date)}</td>
                <td>{money(line.providerChargeCents)}</td>
                <td>{money(line.insurerPaysCents)}</td>
                <td>
                  <strong>{money(line.patientPaysCents)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td>{money(scenario.estimate.totals.providerChargeCents)}</td>
              <td>{money(scenario.estimate.totals.insurerPaysCents)}</td>
              <td>{money(scenario.estimate.totals.patientPaysCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Button variant="ghost" onClick={onSources}>
        Fees from sample document · View source
      </Button>
    </Card>
  );
}
export function TreatmentTimeline({ scenario }: { scenario: Scenario }) {
  return (
    <Card>
      <div className="section-title">
        <CalendarDays size={20} />
        <h3>Treatment timeline</h3>
      </div>
      <ol className="treatment-timeline">
        {scenario.estimate.lines.map((line, index) => (
          <li key={line.procedureId}>
            {index > 0 &&
              scenario.estimate.lines[index - 1].planYearId !==
                line.planYearId && (
                <div className="year-reset">
                  <Badge tone="green">
                    New benefit year · Deductible resets
                  </Badge>
                </div>
              )}
            <div className="timeline-entry">
              <span className="timeline-dot" />
              <div>
                <span className="small muted">{dateLabel(line.date)}</span>
                <strong>{procedureLabel(line.procedureId)}</strong>
              </div>
              <span>
                You pay <strong>{money(line.patientPaysCents)}</strong>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
export function ProcedureDetails({
  scenario,
  onSources,
}: {
  scenario: Scenario;
  onSources: () => void;
}) {
  return (
    <Card>
      <h3>Costs by procedure</h3>
      <p className="small muted">Select a row to see how it was estimated.</p>
      {scenario.estimate.lines.map((line) => (
        <Disclosure
          key={line.procedureId}
          title={
            <div className="procedure-summary">
              <div>
                <strong>{procedureLabel(line.procedureId)}</strong>
                <span className="small muted">{dateLabel(line.date)}</span>
              </div>
              <span className="small muted">
                Fee {money(line.providerChargeCents)}
              </span>
              <strong>You pay {money(line.patientPaysCents)}</strong>
            </div>
          }
        >
          <div className="cost-equation">
            <Row label="Dentist fee" value={money(line.providerChargeCents)} />
            <Row
              label="Contractual write-off"
              value={money(line.contractualWriteoffCents)}
            />
            <Row label="Insurer payment" value={money(line.insurerPaysCents)} />
            <Row
              label="Your estimated cost"
              value={money(line.patientPaysCents)}
              strong
            />
          </div>
          <p className="small muted">
            Your cost consists of separate, non-overlapping amounts:
          </p>
          <Row
            label="Deductible applied"
            value={money(line.deductibleAppliedCents)}
          />
          <Row
            label="Post-deductible coinsurance"
            value={money(line.coinsuranceCents)}
          />
          <Row
            label="Annual maximum shortfall"
            value={money(line.capShortfallCents)}
          />
          <Row label="Balance billing" value={money(line.balanceBillCents)} />
          <Button variant="ghost" onClick={onSources}>
            View calculation sources
          </Button>
        </Disclosure>
      ))}
      <Row
        label="Total estimated patient cost"
        value={money(scenario.estimate.totals.patientPaysCents)}
        strong
      />
    </Card>
  );
}
export function Conditions() {
  return (
    <Card>
      <h3>Important conditions</h3>
      <ul className="condition-list">
        <li>
          2027 coverage and fees are <strong>assumed unchanged</strong>. Confirm
          the renewal with your insurer.
        </li>
        <li>
          Moving treatment requires a dentist-supplied window. Your dentist
          determines timing.
        </li>
        <li>
          These are estimates using fictional information. Final coverage and
          costs may differ.
        </li>
      </ul>
    </Card>
  );
}
