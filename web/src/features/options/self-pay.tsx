import type { CoverageComparison, Scenario } from '@actionbridge/contracts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Orb,
  PageHeading,
  Row,
} from '../../components/ui';
import { money, scenarioTitle, treatmentTitle } from '../../domain/model';
import { localToday, quoteTexts, selfPayChanges } from '../../domain/self-pay';
import { asApiError, type ApiError } from '../../services/api';
import { useCase, useResults } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';

/**
 * Self-pay comparison. Quotes are the dentist's written cash prices per procedure, saved to the
 * case; the comparison itself comes from the server (coverage comparison), never from browser
 * arithmetic. An empty price is unknown, never $0.
 */
export function SelfPay({
  coverage,
  scenarios = [],
}: {
  coverage: CoverageComparison;
  scenarios?: Scenario[];
}) {
  const { record } = useCase();
  const [editing, setEditing] = useState(
    coverage.selfPay.status === 'unavailable',
  );
  if (!record) return null;
  const available =
    coverage.selfPay.status === 'available' ? coverage.selfPay : null;
  return (
    <Card className="stack">
      <PageHeading
        title={
          available && !editing
            ? 'Self-pay compared with your plan'
            : 'Add a self-pay quote'
        }
        description={`Ask your dentist for a written cash price for the same treatment: ${treatmentTitle(record)}.`}
      />
      {!available &&
        coverage.selfPay.status === 'unavailable' &&
        coverage.selfPay.missingQuoteProcedureIds.length > 0 &&
        coverage.selfPay.missingQuoteProcedureIds.length <
          record.procedures.length && (
          <Notice tone="warning">
            Add a cash price for{' '}
            {coverage.selfPay.missingQuoteProcedureIds
              .map(
                (id) =>
                  record.procedures.find((p) => p.id === id)?.label ??
                  'each procedure',
              )
              .join(', ')}{' '}
            to compare. Saved prices are kept.
          </Notice>
        )}
      {editing || !available ? (
        <QuoteForm
          onSaved={() => setEditing(false)}
          onCancel={available ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <div className="actions">
            <Badge>
              {available.lines.some((l) => l.source === 'synthetic')
                ? 'Sample quote'
                : 'Provided by you · Unverified'}
            </Badge>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit quotes
            </Button>
          </div>
          <div className="cash-comparison">
            <div className="cash-cell">
              <p className="small muted">Self-pay quotes</p>
              <strong>{money(available.totalCents)}</strong>
              <p className="small muted">Same treatment scope</p>
            </div>
            {coverage.insured.status === 'estimated' && (
              <div className="cash-cell">
                <p className="small muted">Using your plan · original dates</p>
                <strong>
                  {money(coverage.insured.totals.patientPaysCents)}
                </strong>
                {coverage.selfPayMinusInsuredCents !== null && (
                  <p className="accent small">
                    {coverage.selfPayMinusInsuredCents === 0
                      ? 'Equal treatment cost'
                      : coverage.selfPayMinusInsuredCents < 0
                        ? `Cash is ${money(-coverage.selfPayMinusInsuredCents)} lower`
                        : `Using your plan is ${money(coverage.selfPayMinusInsuredCents)} lower`}
                  </p>
                )}
              </div>
            )}
            {scenarios
              .filter((s) => s.kind === 'alternative')
              .map((s) => (
                <div className="cash-cell" key={s.scenarioId}>
                  <p className="small muted">{scenarioTitle(s)}</p>
                  <strong>{money(s.estimate.totals.patientPaysCents)}</strong>
                  <p className="small muted">
                    Using your plan · permitted timing
                  </p>
                </div>
              ))}
          </div>
          {available.lines.map((line) => (
            <Row
              key={line.procedureId}
              label={`${record.procedures.find((p) => p.id === line.procedureId)?.label ?? 'Procedure'} · cash price`}
              value={money(line.amountCents)}
            />
          ))}
          {coverage.notes.map((note) => (
            <p key={note.code} className="small muted">
              {note.message}
            </p>
          ))}
        </>
      )}
      <Notice>
        This compares treatment costs, not the value of buying insurance.
        Premiums aren't included. Confirm what the cash quote includes and
        whether cash billing is available.
      </Notice>
    </Card>
  );
}

function QuoteForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel?: (() => void) | undefined;
}) {
  const { record, patch } = useCase();
  const [texts, setTexts] = useState(() => (record ? quoteTexts(record) : {}));
  const [scope, setScope] = useState(
    () => !!record?.procedures.some((p) => p.selfPayQuote),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  if (!record) return null;
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const result = selfPayChanges(
          record,
          texts,
          scope,
          localToday(new Date()),
        );
        if ('errors' in result) {
          setErrors(result.errors);
          return;
        }
        setErrors({});
        setSaving(true);
        setFailure(null);
        try {
          await patch(result.changes);
          onSaved();
        } catch (caught) {
          setFailure(asApiError(caught));
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="muted small">
        Use your dentist’s written prices. A quoted $0 is valid; an empty field
        means unknown.
      </p>
      <div className="form-grid">
        {record.procedures.map((p) => (
          <Field
            key={p.id}
            label={`${p.label} · cash price`}
            error={errors[p.id]}
          >
            <div className="money-input">
              <span>$</span>
              <input
                inputMode="decimal"
                value={texts[p.id] ?? ''}
                placeholder="0.00"
                onChange={(e) =>
                  setTexts((current) => ({
                    ...current,
                    [p.id]: e.target.value,
                  }))
                }
              />
            </div>
          </Field>
        ))}
      </div>
      <label className={`consent-box ${scope ? 'checked' : ''}`}>
        <input
          type="checkbox"
          checked={scope}
          onChange={(e) => setScope(e.target.checked)}
        />
        <span>
          Each quote covers the same service as the treatment estimate.
        </span>
      </label>
      {errors.scope && <Notice tone="danger">{errors.scope}</Notice>}
      {failure && <ApiNotice error={failure} />}
      <div className="actions">
        <Button type="submit" busy={saving}>
          Save quotes
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** A cash-only branch doesn't require insurer balances or fabricate insured costs. */
export function SelfPayPage() {
  const { record } = useCase();
  const { data, error, retry } = useResults();
  const navigate = useNavigate();
  return (
    <div className="page medium">
      <PageHeading
        eyebrow="Self-pay"
        title="Your treatment quote"
        description={
          record
            ? `Review a cash quote for ${treatmentTitle(record)}.`
            : undefined
        }
      />
      {!record ? (
        <Card>
          <p>Start a case to review your treatment quote.</p>
          <Button onClick={() => navigate('/')}>Start on Home</Button>
        </Card>
      ) : error ? (
        <ApiNotice error={error} onRetry={retry} />
      ) : !data ? (
        <div className="centered" role="status">
          <Orb size={110} active />
        </div>
      ) : (
        <SelfPay coverage={data.coverage} />
      )}
      <div className="actions">
        <Button variant="secondary" onClick={() => navigate('/facts')}>
          Review treatment details
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
