import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DentalCaseInput } from '@actionbridge/contracts';
import { Badge, Button, Card, Field, Notice } from '../../components/ui';
import { amountLabel, parseMoney } from '../../domain/model';
import {
  blankYear,
  categories,
  coverageOptions,
  emptyPolicy,
  emptyProcedure,
  networkOptions,
  yearEnd,
} from '../../domain/case-fields';

export function AmountField({
  label,
  value,
  onChange,
  percent = false,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  percent?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value / 100));
  const [error, setError] = useState('');
  return (
    <Field
      label={label}
      error={error}
      hint={
        percent
          ? '0–100%. Leave blank if unknown.'
          : 'Dollars and cents. Leave blank if unknown.'
      }
    >
      <div className="money-input">
        <span>{percent ? '%' : '$'}</span>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const cents = next.trim() === '' ? null : parseMoney(next);
            const invalid =
              next.trim() !== '' &&
              (cents === null || (percent && cents > 10000));
            e.target.setCustomValidity(invalid ? 'Enter a valid amount.' : '');
            setError(
              invalid
                ? percent
                  ? 'Enter a percentage from 0 to 100.'
                  : 'Enter a valid amount with up to two decimal places.'
                : '',
            );
            onChange(invalid ? null : cents);
          }}
        />
      </div>
    </Field>
  );
}
type Props = {
  input: DentalCaseInput;
  onChange: (input: DentalCaseInput) => void;
};
export function TreatmentFields({ input, onChange }: Props) {
  const patch = (id: string, values: Record<string, unknown>) =>
    onChange({
      ...input,
      procedures: input.procedures.map((p) =>
        p.id === id ? { ...p, ...values } : p,
      ),
    });
  return (
    <div className="stack">
      {input.procedures.map((p, i) => (
        <Card className="stack" key={p.id}>
          <div className="section-title">
            <h3>Procedure {i + 1}</h3>
            {input.procedures.length > 1 && (
              <Button
                variant="ghost"
                icon={Trash2}
                aria-label={`Remove ${p.label || `procedure ${i + 1}`}`}
                onClick={() =>
                  onChange({
                    ...input,
                    procedures: input.procedures
                      .filter((x) => x.id !== p.id)
                      .map((x) => ({
                        ...x,
                        prerequisiteIds: x.prerequisiteIds.filter(
                          (id) => id !== p.id,
                        ),
                      })),
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
          <div className="form-grid">
            <Field label={`Procedure ${i + 1} name`}>
              <input
                required
                maxLength={120}
                value={p.label}
                placeholder="For example, Crown"
                onChange={(e) => patch(p.id, { label: e.target.value })}
              />
            </Field>
            <Field label={`Procedure ${i + 1} type`}>
              <select
                required
                value={p.category}
                onChange={(e) => patch(p.id, { category: e.target.value })}
              >
                <option value="">Choose a service type</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'basic'
                      ? 'Basic · fillings, simple extractions'
                      : 'Major · crowns, bridges'}
                  </option>
                ))}
              </select>
            </Field>
            <AmountField
              label={`${p.label || `Procedure ${i + 1}`} · Dentist’s charge`}
              value={p.providerChargeCents}
              onChange={(v) => patch(p.id, { providerChargeCents: v })}
            />
            <AmountField
              label={`${p.label || `Procedure ${i + 1}`} · Plan’s allowed amount`}
              value={p.allowedCents}
              onChange={(v) => patch(p.id, { allowedCents: v })}
            />
            <AmountField
              label={`${p.label || `Procedure ${i + 1}`} · Dentist writes off`}
              value={p.contractualWriteoffCents}
              onChange={(v) => patch(p.id, { contractualWriteoffCents: v })}
            />
            <Field
              label={`${p.label || `Procedure ${i + 1}`} · Provider network`}
            >
              <select
                value={p.network}
                onChange={(e) => patch(p.id, { network: e.target.value })}
              >
                {networkOptions.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`${p.label || `Procedure ${i + 1}`} · Planned date`}
              hint={
                p.dentistEarliestDate && p.dentistLatestDate
                  ? 'Choose within the existing dentist window.'
                  : 'Enter the date discussed with your dentist. No alternate timing will be inferred.'
              }
            >
              <input
                type="date"
                min={p.dentistEarliestDate ?? undefined}
                max={p.dentistLatestDate ?? undefined}
                value={p.proposedDate ?? ''}
                onChange={(e) =>
                  patch(p.id, { proposedDate: e.target.value || null })
                }
              />
            </Field>
          </div>
          {p.dentistEarliestDate && p.dentistLatestDate ? (
            <p className="small muted">
              Dentist-supplied window: {p.dentistEarliestDate} –{' '}
              {p.dentistLatestDate}. The app cannot change this instruction.
            </p>
          ) : (
            <Notice>
              No dentist-supplied timing window is available. This procedure
              will not be moved to a different date.
            </Notice>
          )}
        </Card>
      ))}
      <div>
        <Button
          variant="secondary"
          icon={Plus}
          disabled={input.procedures.length >= 6}
          onClick={() =>
            onChange({
              ...input,
              procedures: [...input.procedures, emptyProcedure()],
            })
          }
        >
          Add another procedure
        </Button>
        <p className="small muted">
          Up to six procedures. Unknown prices stay unanswered.
        </p>
      </div>
    </div>
  );
}
export function CoverageFields({ input, onChange }: Props) {
  const policy = input.policy ?? emptyPolicy();
  const used = [
    ...new Set(input.procedures.map((p) => p.category).filter(Boolean)),
  ];
  const policyPatch = (
    key:
      | 'insurerRateBpsByCategory'
      | 'deductibleAppliesByCategory'
      | 'annualMaximumAppliesByCategory',
    category: string,
    value: number | boolean | null,
  ) => {
    const map = { ...policy[key] };
    if (value === null) delete map[category];
    else Object.assign(map, { [category]: value });
    onChange({ ...input, policy: { ...policy, [key]: map } });
  };
  const years = Object.entries(input.planYears).sort((a, b) =>
    a[1].startDate.localeCompare(b[1].startDate),
  );
  const patchYear = (id: string, patch: Record<string, unknown>) =>
    onChange({
      ...input,
      planYears: {
        ...input.planYears,
        [id]: {
          ...input.planYears[id],
          ...patch,
          sourceStatus: 'user_entered',
        },
      },
    });
  const [start, setStart] = useState('');
  return (
    <div className="stack">
      <Card className="stack">
        <h3>Coverage rules</h3>
        <Notice>
          Demo model: individual PPO, covered services, deductible before
          coinsurance. Waiting periods, exclusions and frequency limits require
          a separate eligibility review.
        </Notice>
        {used.map((c) => (
          <div className="rule-group" key={c}>
            <h4>{c.charAt(0).toUpperCase() + c.slice(1)} services</h4>
            <div className="form-grid">
              <AmountField
                key={`${c}-rate`}
                percent
                label={`${c} services · Plan pays`}
                value={policy.insurerRateBpsByCategory[c]}
                onChange={(v) => policyPatch('insurerRateBpsByCategory', c, v)}
              />
              {(
                [
                  'deductibleAppliesByCategory',
                  'annualMaximumAppliesByCategory',
                ] as const
              ).map((map) => (
                <Field
                  label={`${c} services · ${map === 'deductibleAppliesByCategory' ? 'Deductible applies' : 'Annual maximum applies'}`}
                  key={map}
                >
                  <select
                    value={
                      policy[map][c] === undefined
                        ? 'unknown'
                        : String(policy[map][c])
                    }
                    onChange={(e) =>
                      policyPatch(
                        map,
                        c,
                        e.target.value === 'unknown'
                          ? null
                          : e.target.value === 'true',
                      )
                    }
                  >
                    <option value="unknown">Not sure</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </Field>
              ))}
            </div>
          </div>
        ))}
      </Card>
      {years.map(([id, y], i) => (
        <Card className="stack" key={id}>
          <div className="section-title">
            <h3>{i === 0 ? 'Current' : 'Next'} benefit year</h3>
            <Badge
              tone={
                y.sourceStatus === 'explicit_unchanged_plan_assumption'
                  ? 'assumed'
                  : undefined
              }
            >
              {y.sourceStatus === 'explicit_unchanged_plan_assumption'
                ? 'Assumed unchanged'
                : 'Provided by you'}
            </Badge>
            {i > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  const planYears = { ...input.planYears };
                  delete planYears[id];
                  onChange({ ...input, planYears });
                }}
              >
                Remove year
              </Button>
            )}
          </div>
          <div className="form-grid">
            <Field label={`${id} · Benefit year starts`}>
              <input
                type="date"
                required
                value={y.startDate}
                onChange={(e) => {
                  if (e.target.value)
                    patchYear(id, {
                      startDate: e.target.value,
                      endDate: yearEnd(e.target.value),
                    });
                }}
              />
            </Field>
            <Field label={`${id} · Benefit year ends`}>
              <input
                type="date"
                required
                min={y.startDate}
                value={y.endDate}
                onChange={(e) => patchYear(id, { endDate: e.target.value })}
              />
            </Field>
            {(
              [
                ['annualMaximumCents', 'Annual insurer maximum'],
                ['annualDeductibleCents', 'Annual deductible'],
                ['insurerAlreadyPaidCents', 'Insurer already paid'],
                ['deductibleAlreadyMetCents', 'Deductible already met'],
              ] as const
            ).map(([field, label]) => (
              <AmountField
                key={field}
                label={`${id} · ${label}`}
                value={y[field]}
                onChange={(v) => patchYear(id, { [field]: v })}
              />
            ))}
          </div>
        </Card>
      ))}
      {years.length < 2 && (
        <Card className="stack">
          <h3>
            {years.length ? 'Add next benefit year' : 'Add your benefit year'}
          </h3>
          <p className="muted small">
            Enter the date from your benefits summary. Balances and terms will
            remain unknown until you enter them.
          </p>
          <div className="actions">
            <Field label="New benefit year start">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={
                !start ||
                Object.values(input.planYears).some((y) => start <= y.endDate)
              }
              onClick={() => {
                onChange({
                  ...input,
                  planYears: {
                    ...input.planYears,
                    [`py-${start}`]: blankYear(start),
                  },
                });
                setStart('');
              }}
            >
              Add benefit year
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
export function CoverageStatus({ input, onChange }: Props) {
  return (
    <Field label="Insurance status">
      <select
        value={input.coverageMode}
        onChange={(e) =>
          onChange({
            ...input,
            coverageMode: e.target.value as DentalCaseInput['coverageMode'],
          })
        }
      >
        {coverageOptions.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function validateCase(input: DentalCaseInput): string | null {
  for (const p of input.procedures) {
    if (!p.label.trim()) return 'Name each procedure before continuing.';
    if (!p.category) return 'Choose a service type for each procedure.';
    if (
      p.allowedCents !== null &&
      p.providerChargeCents !== null &&
      p.allowedCents > p.providerChargeCents
    )
      return `${p.label}: the allowed amount cannot exceed the dentist’s charge.`;
    if (
      p.providerChargeCents !== null &&
      p.contractualWriteoffCents !== null &&
      (p.allowedCents ?? 0) + p.contractualWriteoffCents > p.providerChargeCents
    )
      return `${p.label}: allowed amount and write-off cannot exceed the charge.`;
    if (
      p.proposedDate &&
      ((p.dentistEarliestDate && p.proposedDate < p.dentistEarliestDate) ||
        (p.dentistLatestDate && p.proposedDate > p.dentistLatestDate))
    )
      return `${p.label}: choose a date within the dentist’s window.`;
  }
  const years = Object.values(input.planYears).sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    if (
      y.endDate < y.startDate ||
      (i > 0 && y.startDate <= years[i - 1].endDate)
    )
      return 'Benefit years must be in order and must not overlap.';
    if (
      y.annualMaximumCents !== null &&
      y.insurerAlreadyPaidCents !== null &&
      y.insurerAlreadyPaidCents > y.annualMaximumCents
    )
      return 'Insurer payments cannot exceed the annual maximum.';
    if (
      y.annualDeductibleCents !== null &&
      y.deductibleAlreadyMetCents !== null &&
      y.deductibleAlreadyMetCents > y.annualDeductibleCents
    )
      return `Deductible already met cannot exceed ${amountLabel(y.annualDeductibleCents)}.`;
  }
  return null;
}
