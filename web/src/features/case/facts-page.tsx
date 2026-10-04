import { Check, ClipboardList, FileText, Mic, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  amountLabel,
  currentYear,
  dateLabel,
  parseMoney,
  treatmentTitle,
} from '../../domain/model';
import { fieldValue, nextQuestion, setField } from '../../domain/case-fields';
import { useDemo } from '../../state/demo-store';
import { CaseEditor } from '../intake/manual-page';
import { validateCase } from '../intake/case-forms';
import { sampleInput } from '../../services/dental-service';

export const missingQuestion = nextQuestion;
export function FactsPage() {
  const { state, confirm, edit, setCaseFlags } = useDemo();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{
    path: string;
    label: string;
  } | null>(null);
  const [section, setSection] = useState<'treatment' | 'coverage' | null>(null);
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
  const missing = nextQuestion(input);
  const badge = (path: string) => {
    const value = fieldValue(input, path);
    const unknown = value == null || value === 'unknown';
    const assumed =
      path.startsWith('planYears.') &&
      input.planYears[path.split('.')[1]]?.sourceStatus ===
        'explicit_unchanged_plan_assumption';
    return (
      <Badge
        tone={
          unknown
            ? 'warning'
            : state.provenance[path]
              ? 'green'
              : assumed
                ? 'assumed'
                : undefined
        }
      >
        {unknown
          ? 'Needs an answer'
          : state.provenance[path]
            ? 'Provided by you'
            : assumed
              ? 'Assumed for comparison'
              : state.origin === 'sample'
                ? 'From sample document'
                : 'Provided by you'}
      </Badge>
    );
  };
  const editable = (path: string, label: string, value: string) => (
    <div className="fact-edit-row" key={path}>
      <div>
        <span className="small muted">{label}</span>
        <strong>{value}</strong>
        {badge(path)}
      </div>
      <Button
        variant="ghost"
        icon={Pencil}
        aria-label={`Edit ${label.toLowerCase()}`}
        onClick={() => setEditing({ path, label })}
      >
        Edit
      </Button>
    </div>
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow={`${state.origin === 'sample' ? 'Sample case' : 'Manual demo case'} · Review before calculating`}
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
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => setSection('treatment')}
              >
                Edit treatment
              </Button>
            </div>
            <p className="muted small">{treatmentTitle(input)}</p>
            {input.procedures.map((p) => (
              <Disclosure
                key={p.id}
                title={
                  <div className="fact-summary">
                    <strong>{p.label}</strong>
                    <span className="muted small">
                      {amountLabel(p.providerChargeCents)} ·{' '}
                      {p.proposedDate
                        ? dateLabel(p.proposedDate)
                        : 'Date not answered'}{' '}
                      · {p.category} service
                    </span>
                  </div>
                }
              >
                {editable(
                  `procedures.${p.id}.providerChargeCents`,
                  `${p.label} fee`,
                  amountLabel(p.providerChargeCents),
                )}
                {editable(
                  `procedures.${p.id}.allowedCents`,
                  `${p.label} allowed amount`,
                  amountLabel(p.allowedCents),
                )}
                {editable(
                  `procedures.${p.id}.contractualWriteoffCents`,
                  `${p.label} write-off`,
                  amountLabel(p.contractualWriteoffCents),
                )}
                {editable(
                  `procedures.${p.id}.network`,
                  `${p.label} network`,
                  p.network === 'in'
                    ? 'In network'
                    : p.network === 'out'
                      ? 'Out of network'
                      : 'Not sure',
                )}
                {editable(
                  `procedures.${p.id}.proposedDate`,
                  p.id === 'crown-1'
                    ? 'Proposed crown date'
                    : `${p.label} planned date`,
                  p.proposedDate ? dateLabel(p.proposedDate) : 'Not answered',
                )}
                <Row
                  label="Insurer rate after deductible"
                  value={
                    input.policy?.insurerRateBpsByCategory[p.category] ===
                    undefined
                      ? 'Not answered'
                      : `${input.policy.insurerRateBpsByCategory[p.category] / 100}%`
                  }
                />
                <Row
                  label="Dentist’s timing window"
                  value={
                    p.dentistEarliestDate && p.dentistLatestDate
                      ? `${dateLabel(p.dentistEarliestDate)} – ${dateLabel(p.dentistLatestDate)}`
                      : 'Not provided — dates will not be moved'
                  }
                />
              </Disclosure>
            ))}
          </Card>
          <Card>
            <div className="section-title">
              <h3>Your current plan</h3>
              <Button
                variant="secondary"
                onClick={() => setSection('coverage')}
              >
                Edit coverage rules
              </Button>
            </div>
            {editable(
              'coverageMode',
              'Insurance status',
              input.coverageMode === 'insured'
                ? 'Insured'
                : input.coverageMode === 'self_pay'
                  ? 'Self-pay'
                  : 'Not sure',
            )}
            {input.coverageMode !== 'self_pay' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      path: 'all-network',
                      label: 'Provider network',
                    })
                  }
                >
                  Edit provider network
                </Button>
                {Object.entries(input.planYears)
                  .sort((a, b) => a[1].startDate.localeCompare(b[1].startDate))
                  .map(([id, y], i) => (
                    <section className="rule-group" key={id}>
                      <h4>
                        {i === 0 ? 'Current' : 'Next'} benefit year ·{' '}
                        {dateLabel(y.startDate)} – {dateLabel(y.endDate)}
                      </h4>
                      {y.sourceStatus ===
                        'explicit_unchanged_plan_assumption' && (
                        <Badge tone="assumed">Assumed for comparison</Badge>
                      )}
                      {(
                        [
                          ['annualMaximumCents', 'Annual insurer maximum'],
                          ['annualDeductibleCents', 'Annual deductible'],
                          [
                            'insurerAlreadyPaidCents',
                            'Insurer already paid this year',
                          ],
                          [
                            'deductibleAlreadyMetCents',
                            'Deductible already met',
                          ],
                        ] as const
                      ).map(([field, label]) =>
                        editable(
                          `planYears.${id}.${field}`,
                          i === 0 ? label : `Next year ${label.toLowerCase()}`,
                          amountLabel(y[field]),
                        ),
                      )}
                    </section>
                  ))}
                {!currentYear(input) && (
                  <Notice tone="warning">
                    Benefit-year dates and balances are still needed. We’ll ask
                    for the start date next.
                  </Notice>
                )}
              </>
            )}
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
                      ? 'Local file · Not interpreted'
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
          {state.origin === 'sample' && (
            <Card>
              <h3>Prefer the original sample?</h3>
              <p className="small muted">
                Restore fictional plan, fees and timing. Previous results need
                recalculation.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  edit((d) => Object.assign(d, sampleInput(50000)));
                  setCaseFlags({
                    documentNeeded: false,
                    documentDeclined: false,
                    deductibleConflict: false,
                  });
                }}
              >
                Restore sample values
              </Button>
            </Card>
          )}
        </aside>
      </div>
      <FooterActions note="These demo facts are not verified insurer terms.">
        <Button variant="secondary" onClick={() => navigate('/')}>
          Finish later
        </Button>
        <Button
          icon={Check}
          onClick={() => {
            if (input.coverageMode === 'self_pay') navigate('/self-pay');
            else if (
              missing ||
              state.documentNeeded ||
              state.deductibleConflict
            )
              navigate('/questions');
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
      {section && (
        <CaseEditor section={section} onClose={() => setSection(null)} />
      )}
      {sources && <Evidence onClose={() => setSources(false)} />}
    </div>
  );
}
function FactEditor({
  field,
  onClose,
}: {
  field: { path: string; label: string };
  onClose: () => void;
}) {
  const { state, edit } = useDemo();
  const input = state.input!;
  const choice =
    field.path === 'coverageMode' ||
    field.path === 'all-network' ||
    field.path.endsWith('.network');
  const date = field.path.endsWith('.proposedDate');
  const initial =
    field.path === 'all-network'
      ? input.procedures[0]?.network
      : fieldValue(input, field.path);
  const [value, setValue] = useState(
    initial == null
      ? ''
      : typeof initial === 'number'
        ? String(initial / 100)
        : String(initial),
  );
  const [error, setError] = useState('');
  const p = input.procedures.find((p) =>
    field.path.startsWith(`procedures.${p.id}.`),
  );
  const options =
    field.path === 'coverageMode'
      ? [
          { value: 'insured', label: 'Insured' },
          { value: 'self_pay', label: 'Self-pay' },
          { value: 'unknown', label: 'Not sure' },
        ]
      : [
          { value: 'in', label: 'In network' },
          { value: 'out', label: 'Out of network' },
          { value: 'unknown', label: 'Not sure' },
        ];
  const label = field.path.endsWith('insurerAlreadyPaidCents')
    ? 'Insurer payments this year'
    : field.label;
  return (
    <Dialog title={`Edit ${field.label.toLowerCase()}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = parseMoney(value);
          if (!choice && !date && value.trim() !== '' && cents === null) {
            setError('Enter a valid amount with up to two decimal places.');
            return;
          }
          const draft = structuredClone(input);
          if (field.path === 'all-network')
            draft.procedures.forEach(
              (p) => (p.network = value as 'in' | 'out' | 'unknown'),
            );
          else
            setField(
              draft,
              field.path,
              choice ? value : date ? value || null : cents,
            );
          const error = validateCase(draft);
          if (error) {
            setError(error);
            return;
          }
          edit((d) => Object.assign(d, draft));
          onClose();
        }}
      >
        <Field
          label={label}
          error={error}
          hint={!choice && !date ? 'Leave blank if unknown.' : undefined}
        >
          {choice ? (
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              {options.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : date ? (
            <input
              type="date"
              value={value}
              min={p?.dentistEarliestDate ?? undefined}
              max={p?.dentistLatestDate ?? undefined}
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
          by the shared benefits engine.
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
