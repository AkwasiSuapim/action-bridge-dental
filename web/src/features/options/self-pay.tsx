import type { Scenario } from '@actionbridge/contracts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  PageHeading,
  Row,
} from '../../components/ui';
import {
  money,
  parseMoney,
  scenarioTitle,
  treatmentTitle,
} from '../../domain/model';
import { AmountField } from '../intake/case-forms';
import { useDemo } from '../../state/demo-store';
export function SelfPay({ scenarios }: { scenarios: Scenario[] }) {
  const { state, setQuote } = useDemo();
  const [value, setValue] = useState(
    state.quote ? String(state.quote.cents / 100) : '',
  );
  const [editing, setEditing] = useState(!state.quote);
  const [error, setError] = useState('');
  const [itemized, setItemized] = useState(false);
  const save = () => {
    const cents = parseMoney(value);
    if (cents === null || cents <= 0) {
      setError('Enter a positive cash quote with up to two decimal places.');
      return;
    }
    setQuote({ cents, source: 'user' });
    setEditing(false);
    setError('');
  };
  return (
    <Card className="stack">
      <PageHeading
        title={
          editing || !state.quote
            ? 'Add a self-pay quote'
            : 'Self-pay compared with your plan'
        }
        description={`Ask your dentist for a written cash price for the same treatment: ${treatmentTitle(state.input)}.`}
      />
      <div className="actions">
        <Button
          variant="secondary"
          aria-pressed={itemized}
          onClick={() => setItemized(!itemized)}
        >
          {itemized ? 'Use one combined quote' : 'Enter individual cash prices'}
        </Button>
      </div>
      {itemized && (
        <ItemizedQuote
          onSaved={(cents) => {
            setValue(String(cents / 100));
            setItemized(false);
            setEditing(false);
          }}
        />
      )}
      {!itemized && (
        <>
          {editing || !state.quote ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Field
                label={
                  state.input?.procedures.length === 3
                    ? 'Cash quote for all three procedures'
                    : 'Cash quote for all procedures'
                }
                error={error}
              >
                <div className="money-input quote-input">
                  <span>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="Enter quoted amount"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              </Field>
              <div className="actions">
                <Button type="submit">Add quote</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuote({ cents: 150000, source: 'sample' });
                    setValue('1500');
                    setEditing(false);
                  }}
                >
                  Use sample quote: $1,500
                </Button>
                {state.quote && (
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancel edit
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <>
              <div className="actions">
                <Badge>
                  {state.quote.source === 'sample'
                    ? 'Sample quote'
                    : 'Provided by you · Unverified'}
                </Badge>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit quote
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuote(null);
                    setEditing(true);
                    setValue('');
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="cash-comparison">
                <div className="cash-cell">
                  <p className="small muted">Self-pay quote</p>
                  <strong>{money(state.quote.cents)}</strong>
                  <p className="small muted">Same treatment scope</p>
                </div>
                {scenarios.map((s) => {
                  const difference =
                    state.quote!.cents - s.estimate.totals.patientPaysCents;
                  return (
                    <div className="cash-cell" key={s.scenarioId}>
                      <p className="small muted">{scenarioTitle(s)}</p>
                      <strong>
                        {money(s.estimate.totals.patientPaysCents)}
                      </strong>
                      <p className="small muted">
                        {s.kind === 'baseline'
                          ? 'All in 2026'
                          : 'Across two benefit years'}
                      </p>
                      <p className="accent small">
                        {difference === 0
                          ? 'Equal treatment cost'
                          : difference < 0
                            ? `Cash is ${money(-difference)} lower`
                            : `Using this schedule is ${money(difference)} lower`}
                      </p>
                    </div>
                  );
                })}
              </div>
              <Row label="Quote scope" value={treatmentTitle(state.input)} />
              {state.quote.perProcedure && (
                <>
                  {state.input?.procedures.map((p) => (
                    <Row
                      key={p.id}
                      label={`${p.label} · cash price`}
                      value={money(state.quote!.perProcedure![p.id])}
                    />
                  ))}
                  <Badge>Individual prices · Scope confirmed by you</Badge>
                </>
              )}
            </>
          )}
        </>
      )}
      <Notice>
        This compares treatment costs, not the value of buying insurance.
        Premiums aren't included. Timing differs between insured options;
        confirm what the cash quote includes and whether cash billing is
        available.
      </Notice>
    </Card>
  );
}

function ItemizedQuote({ onSaved }: { onSaved: (cents: number) => void }) {
  const { state, setQuote } = useDemo();
  const [prices, setPrices] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      state.input!.procedures.map((p) => [
        p.id,
        state.quote?.perProcedure?.[p.id] ?? null,
      ]),
    ),
  );
  const [scope, setScope] = useState(state.quote?.scopeConfirmed ?? false);
  const [error, setError] = useState('');
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scope) {
          setError('Confirm that each quote covers the same service.');
          return;
        }
        if (Object.values(prices).some((v) => v === null)) {
          setError(
            'Enter a written price for every procedure. Unknown is not $0.',
          );
          return;
        }
        const perProcedure = prices as Record<string, number>;
        setQuote({
          cents: Object.values(perProcedure).reduce((sum, v) => sum + v, 0),
          source: 'user',
          perProcedure,
          scopeConfirmed: true,
        });
        onSaved(Object.values(perProcedure).reduce((sum, v) => sum + v, 0));
      }}
    >
      <h3>Individual cash prices</h3>
      <p className="muted small">
        Use your dentist’s written prices. A quoted $0 is valid; an empty field
        is unknown.
      </p>
      <div className="form-grid">
        {state.input!.procedures.map((p) => (
          <AmountField
            key={p.id}
            label={`${p.label} · cash price`}
            value={prices[p.id]}
            onChange={(v) =>
              setPrices((current) => ({ ...current, [p.id]: v }))
            }
          />
        ))}
      </div>
      <label className="consent-box">
        <input
          type="checkbox"
          checked={scope}
          onChange={(e) => setScope(e.target.checked)}
        />
        <span>
          Each quote covers the same service as the treatment estimate.
        </span>
      </label>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit">Save individual quotes</Button>
    </form>
  );
}
/** A cash-only branch doesn't require insurer balances or fabricate insured costs. */
export function SelfPayPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  return (
    <div className="page medium">
      <PageHeading
        eyebrow="Sample case · Self-pay"
        title="Your treatment quote"
        description={`Review a cash quote for ${treatmentTitle(state.input)}.`}
      />
      {state.input ? (
        <SelfPay scenarios={[]} />
      ) : (
        <Card>
          <p>Start a case to review your treatment quote.</p>
          <Button onClick={() => navigate('/')}>Start on Home</Button>
        </Card>
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
