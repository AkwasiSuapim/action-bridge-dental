import {
  Check,
  ClipboardList,
  FileText,
  Mic,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DentalCaseInput } from '@actionbridge/contracts';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Disclosure,
  EmptyState,
  Field,
  FooterActions,
  Notice,
  PageHeading,
  Row,
} from '../../components/ui';
import { Evidence } from '../../components/evidence';
import { dateLabel, money, parseMoney } from '../../domain/model';
import { useDemo } from '../../state/demo-store';

type EditField =
  | 'paid'
  | 'coverage'
  | 'network'
  | 'crown-date'
  | 'deductible'
  | 'maximum'
  | 'filling-1'
  | 'filling-2'
  | 'crown-1';
const labels: Record<EditField, string> = {
  paid: 'Insurer payments this year',
  coverage: 'Insurance status',
  network: 'Provider network',
  'crown-date': 'Proposed crown date',
  deductible: 'Annual deductible',
  maximum: 'Annual insurer maximum',
  'filling-1': 'Filling one fee',
  'filling-2': 'Filling two fee',
  'crown-1': 'Crown fee',
};
export function missingQuestion(
  input: DentalCaseInput,
): 'coverage' | 'network' | 'paid' | null {
  if (input.coverageMode === 'unknown') return 'coverage';
  if (input.coverageMode === 'self_pay') return null;
  if (input.procedures.some((p) => p.network === 'unknown')) return 'network';
  if (input.planYears['py-2026'].insurerAlreadyPaidCents === null)
    return 'paid';
  return null;
}
export function FactsPage() {
  const { state, confirm, edit } = useDemo();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EditField | null>(null);
  const [sources, setSources] = useState(false);
  if (!state.input)
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardList}
          title="Nothing added yet"
          description="Start with a treatment description, document, or the fictional sample case."
          action={<Button onClick={() => navigate('/')}>Start on Home</Button>}
        />
      </div>
    );
  const input = state.input;
  const year = input.planYears['py-2026'];
  const missing = missingQuestion(input);
  return (
    <div className="page">
      <PageHeading
        eyebrow="Sample case · Review before calculating"
        title="Here is what we'll use"
        description="Check the treatment, benefits and dates. You can correct any detail."
        actions={
          <Button
            variant="secondary"
            icon={FileText}
            onClick={() => setSources(true)}
          >
            View sources
          </Button>
        }
      />
      <div className="fact-layout">
        <div className="stack">
          <Card>
            <div className="section-title">
              <ClipboardList size={20} />
              <h3>Treatment</h3>
              <Badge>From sample document</Badge>
            </div>
            {input.procedures.map((p) => (
              <Disclosure
                key={p.id}
                title={
                  <div className="fact-summary">
                    <strong>{p.label}</strong>
                    <span className="muted small">
                      {money(p.providerChargeCents ?? 0)} ·{' '}
                      {dateLabel(p.proposedDate ?? p.dentistEarliestDate!)} ·{' '}
                      {p.category === 'basic'
                        ? 'Basic service'
                        : 'Major service'}
                    </span>
                  </div>
                }
              >
                <div className="fact-edit-row">
                  <Row
                    label="Billed and allowed fee"
                    value={money(p.providerChargeCents ?? 0)}
                  />
                  <Button
                    variant="secondary"
                    icon={Pencil}
                    aria-label={`Edit ${p.label.toLowerCase()} fee`}
                    onClick={() => setEditing(p.id as EditField)}
                  >
                    Edit
                  </Button>
                </div>
                <Row
                  label="Insurer rate after deductible"
                  value={`${p.category === 'basic' ? 80 : 50}%`}
                />
                <Row
                  label="Timing source"
                  value="Fictional dentist instruction"
                />
                {p.id === 'crown-1' && (
                  <>
                    <Row
                      label="Permitted crown window"
                      value="Nov 12, 2026 – Jan 15, 2027"
                    />
                    <Button
                      variant="secondary"
                      icon={Pencil}
                      onClick={() => setEditing('crown-date')}
                    >
                      Edit proposed crown date
                    </Button>
                  </>
                )}
              </Disclosure>
            ))}
          </Card>
          <Card>
            <div className="section-title">
              <ShieldCheck size={20} />
              <h3>Your current plan</h3>
              <Badge>Sample individual PPO</Badge>
            </div>
            {(
              [
                {
                  field: 'coverage',
                  label: 'Insurance status',
                  value:
                    input.coverageMode === 'insured'
                      ? 'Insured'
                      : input.coverageMode === 'self_pay'
                        ? 'Self-pay'
                        : 'Not sure',
                },
                {
                  field: 'network',
                  label: 'Provider network',
                  value:
                    input.procedures[0].network === 'in'
                      ? 'In network'
                      : input.procedures[0].network === 'out'
                        ? 'Out of network'
                        : 'Not sure',
                },
                {
                  field: 'maximum',
                  label: 'Annual insurer maximum',
                  value: money(year.annualMaximumCents!),
                },
                {
                  field: 'deductible',
                  label: 'Annual deductible',
                  value: money(year.annualDeductibleCents!),
                },
                {
                  field: 'paid',
                  label: 'Insurer already paid this year',
                  value:
                    year.insurerAlreadyPaidCents === null
                      ? 'Needs confirmation'
                      : money(year.insurerAlreadyPaidCents),
                },
              ] as const
            ).map((row) => (
              <div className="fact-edit-row" key={row.field}>
                <div>
                  <span className="small muted">{row.label}</span>
                  <strong
                    className={
                      row.field === 'paid' &&
                      year.insurerAlreadyPaidCents === null
                        ? 'warning-text'
                        : ''
                    }
                  >
                    {row.value}
                  </strong>
                </div>
                <Button
                  variant="ghost"
                  icon={Pencil}
                  aria-label={`Edit ${row.label.toLowerCase()}`}
                  onClick={() => setEditing(row.field)}
                >
                  Edit
                </Button>
              </div>
            ))}
            <p className="small muted">
              2026 benefit year: January 1–December 31. Reported payments stay
              separate from projected treatment.
            </p>
          </Card>
          <Card>
            <h3>Next benefit year</h3>
            <Row label="2027 maximum / fresh deductible" value="$800 / $50" />
            <Badge tone="assumed">Assumed for comparison</Badge>
            <p className="muted small">
              Coverage and prices are assumed unchanged. Confirm your renewal
              before relying on the split estimate.
            </p>
          </Card>
        </div>
        <aside className="stack facts-aside">
          <Card>
            <h3>Your information</h3>
            <p className="muted small">
              Attachments and descriptions stay in this browser tab.
            </p>
            {state.attachments.map((a) => (
              <div className="document-item" key={a.name}>
                <FileText size={22} />
                <div>
                  <strong className="break-word">{a.name}</strong>
                  <span className="small muted">
                    {a.kind === 'file'
                      ? 'Local file · Sample analysis only'
                      : 'Sample document'}
                  </span>
                </div>
              </div>
            ))}
            {state.transcript && <blockquote>{state.transcript}</blockquote>}
            <div className="actions">
              <Button
                variant="secondary"
                icon={FileText}
                onClick={() => navigate('/intake/upload')}
              >
                Add document
              </Button>
              <Button
                variant="secondary"
                icon={Mic}
                onClick={() => navigate('/intake/speak')}
              >
                Add voice note
              </Button>
            </div>
          </Card>
          <Notice>
            Only a dentist-supplied window permits moving treatment.
            ActionBridge doesn't decide whether care can wait.
          </Notice>
          {missing && (
            <Notice tone="warning">
              A detail needs an answer before the insured comparison is
              available. We'll ask a focused question next.
            </Notice>
          )}
          <Card>
            <h3>Prefer the original sample?</h3>
            <p className="small muted">
              Restore the fictional plan, fees and timing. Previous results will
              need recalculation.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                edit((draft) => {
                  const revision = draft.caseRevision;
                  const restored = structuredClone(input);
                  restored.planYears['py-2026'] = {
                    ...restored.planYears['py-2026'],
                    annualMaximumCents: 80000,
                    annualDeductibleCents: 5000,
                    insurerAlreadyPaidCents: 50000,
                  };
                  restored.coverageMode = 'insured';
                  restored.procedures = restored.procedures.map((p) => ({
                    ...p,
                    network: 'in',
                    providerChargeCents: p.id === 'crown-1' ? 100000 : 25000,
                    allowedCents: p.id === 'crown-1' ? 100000 : 25000,
                    proposedDate:
                      p.id === 'crown-1'
                        ? '2026-11-12'
                        : p.id === 'filling-1'
                          ? '2026-11-10'
                          : '2026-11-11',
                  }));
                  Object.assign(draft, restored, { caseRevision: revision });
                })
              }
            >
              Restore sample values
            </Button>
          </Card>
        </aside>
      </div>
      <FooterActions note="These are fictional sample facts, not verified insurer terms.">
        <Button variant="secondary" onClick={() => navigate('/')}>
          Finish later
        </Button>
        <Button
          icon={Check}
          onClick={() => {
            if (input.coverageMode === 'self_pay') navigate('/self-pay');
            else if (missing) navigate('/questions');
            else {
              confirm();
              navigate('/working');
            }
          }}
        >
          Confirm and compare
        </Button>
      </FooterActions>
      {editing && (
        <FactEditor field={editing} onClose={() => setEditing(null)} />
      )}
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
}
function FactEditor({
  field,
  onClose,
}: {
  field: EditField;
  onClose: () => void;
}) {
  const { state, edit } = useDemo();
  const input = state.input!;
  const year = input.planYears['py-2026'];
  const initial =
    field === 'paid'
      ? year.insurerAlreadyPaidCents
      : field === 'maximum'
        ? year.annualMaximumCents
        : field === 'deductible'
          ? year.annualDeductibleCents
          : input.procedures.find((p) => p.id === field)?.providerChargeCents;
  const [value, setValue] = useState(
    field === 'coverage'
      ? input.coverageMode
      : field === 'network'
        ? input.procedures[0].network
        : field === 'crown-date'
          ? input.procedures.find((p) => p.id === 'crown-1')!.proposedDate!
          : initial === null || initial === undefined
            ? ''
            : String(initial / 100),
  );
  const [error, setError] = useState('');
  const save = () => {
    const cents = parseMoney(value);
    if (
      !['coverage', 'network', 'crown-date'].includes(field) &&
      cents === null
    ) {
      setError('Enter a valid amount with up to two decimal places.');
      return;
    }
    if (field === 'paid' && cents! > year.annualMaximumCents!) {
      setError('Reported payments cannot exceed this sample plan maximum.');
      return;
    }
    if (field === 'maximum' && cents! < (year.insurerAlreadyPaidCents ?? 0)) {
      setError('The maximum must cover reported payments.');
      return;
    }
    if (
      field === 'crown-date' &&
      (!value || value < '2026-11-12' || value > '2027-01-15')
    ) {
      setError('Choose a date within the sample dentist window.');
      return;
    }
    edit((draft) => {
      const current = draft.planYears['py-2026'];
      if (field === 'coverage')
        draft.coverageMode = value as DentalCaseInput['coverageMode'];
      else if (field === 'network')
        draft.procedures.forEach((p) => {
          p.network = value as 'in' | 'out' | 'unknown';
        });
      else if (field === 'crown-date')
        draft.procedures.find((p) => p.id === 'crown-1')!.proposedDate = value;
      else if (field === 'paid') current.insurerAlreadyPaidCents = cents;
      else if (field === 'maximum') current.annualMaximumCents = cents;
      else if (field === 'deductible') current.annualDeductibleCents = cents;
      else {
        const procedure = draft.procedures.find((p) => p.id === field)!;
        procedure.providerChargeCents = cents;
        procedure.allowedCents = cents;
      }
    });
    onClose();
  };
  return (
    <Dialog title={`Edit ${labels[field].toLowerCase()}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={labels[field]} error={error}>
          {field === 'coverage' ? (
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="insured">Insured</option>
              <option value="self_pay">Self-pay</option>
              <option value="unknown">Not sure</option>
            </select>
          ) : field === 'network' ? (
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="in">In network</option>
              <option value="out">Out of network</option>
              <option value="unknown">Not sure</option>
            </select>
          ) : field === 'crown-date' ? (
            <input
              type="date"
              min="2026-11-12"
              max="2027-01-15"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <div className="money-input">
              <span>$</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </Field>
        <Notice>
          Editing invalidates the current estimate. New amounts are calculated
          by the shared benefits engine. This remains a fictional sample policy.
        </Notice>
        <div className="actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
}
