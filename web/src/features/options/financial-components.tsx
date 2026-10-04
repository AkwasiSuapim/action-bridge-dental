import { CalendarDays } from 'lucide-react';
import type { Scenario, DentalCaseInput } from '@actionbridge/contracts';
import { useCase } from '../../state/case-store';
import { Badge, Button, Card, Disclosure, Row } from '../../components/ui';
import {
  dateLabel,
  money,
  procedureLabel,
  scenarioTitle,
} from '../../domain/model';

/** One choice, in plain words: what happens, what you pay, and why it differs. */
export function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  selected: boolean;
  onSelect: () => void;
}) {
  const { record } = useCase();
  const input = record!;
  const moved = scenario.schedule.filter((s) =>
    scenario.movedProcedureIds.includes(s.procedureId),
  );
  return (
    <label className={`choice-card ${selected ? 'selected' : ''}`}>
      <div className="choice-card-head">
        <input
          type="radio"
          name="schedule"
          checked={selected}
          onChange={onSelect}
        />
        <h3>{scenarioTitle(scenario, input)}</h3>
        {scenario.kind === 'alternative' &&
          scenario.differenceFromBaselineCents > 0 && (
            <Badge tone="green">
              Save {money(scenario.differenceFromBaselineCents)}
            </Badge>
          )}
      </div>
      <div className="choice-card-money">
        <span className="small muted">You pay about</span>
        <strong>{money(scenario.estimate.totals.patientPaysCents)}</strong>
        <span className="small muted">
          Your plan pays {money(scenario.estimate.totals.insurerPaysCents)}
        </span>
      </div>
      <p className="small">
        {scenario.kind === 'baseline'
          ? 'Every treatment on the dates your dentist planned.'
          : `${moved
              .map(
                (s) =>
                  `${procedureLabel(s.procedureId, input)} on ${dateLabel(s.date)}`,
              )
              .join(
                ' and ',
              )}, inside the window your dentist allows. A new benefit year starts, so your plan can pay more.`}
      </p>
      {scenario.conditional && (
        <span className="small muted">
          Assumes next year’s plan stays the same.
        </span>
      )}
    </label>
  );
}
export function BenefitYears({
  scenario,
  input: supplied,
}: {
  scenario: Scenario;
  input?: DentalCaseInput;
}) {
  const { record } = useCase();
  const input = supplied ?? record;
  return (
    <Card className="benefit-card">
      <h3>Benefit-year usage</h3>
      <p className="muted small">
        Each year has its own maximum. They're never combined.
      </p>
      {Object.values(scenario.estimate.yearProjections).map((year) => (
        <div className="year-usage" key={year.planYearId}>
          <div className="year-heading">
            <strong>
              {input?.planYears[year.planYearId]?.startDate.slice(0, 4) ??
                year.planYearId.replace('py-', '')}
            </strong>
            <span className="small muted">
              {money(year.annualMaximumCents)} maximum
            </span>
          </div>
          {input?.planYears[year.planYearId] && (
            <p className="small muted">
              {dateLabel(input.planYears[year.planYearId].startDate)} –{' '}
              {dateLabel(input.planYears[year.planYearId].endDate)}
            </p>
          )}
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
  input: supplied,
}: {
  scenario: Scenario;
  onSources: () => void;
  input?: DentalCaseInput;
}) {
  const { record } = useCase();
  const input = supplied ?? record;
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
                <th scope="row">{procedureLabel(line.procedureId, input)}</th>
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
        Treatment fees and sources · View source
      </Button>
    </Card>
  );
}
export function TreatmentTimeline({
  scenario,
  input: supplied,
}: {
  scenario: Scenario;
  input?: DentalCaseInput;
}) {
  const { record } = useCase();
  const input = supplied ?? record;
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
                <strong>{procedureLabel(line.procedureId, input)}</strong>
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
  input: supplied,
}: {
  scenario: Scenario;
  onSources: () => void;
  input?: DentalCaseInput;
}) {
  const { record } = useCase();
  const input = supplied ?? record;
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
                <strong>{procedureLabel(line.procedureId, input)}</strong>
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
          Confirm future coverage, benefit balances and treatment fees with your
          insurer and dentist. Any unchanged-plan assumption remains unverified.
        </li>
        <li>
          Moving treatment requires a dentist-supplied window. Your dentist
          determines timing.
        </li>
        <li>
          These are estimates from the details you confirmed. Final coverage and
          costs may differ.
        </li>
      </ul>
    </Card>
  );
}
