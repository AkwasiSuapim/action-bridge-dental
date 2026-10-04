import { FileText, Mic } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Orb,
  PageHeading,
} from '../../components/ui';
import { currentYear, money, parseMoney } from '../../domain/model';
import {
  fieldLabel,
  nextQuestion,
  setField,
  validDate,
  type CaseQuestion,
} from '../../domain/case-fields';
import { useDemo } from '../../state/demo-store';
import { CaseEditor } from '../intake/manual-page';
import { validateCase } from '../intake/case-forms';

export function QuestionsPage() {
  const { state, edit, setCaseFlags } = useDemo();
  const navigate = useNavigate();
  const input = state.input;
  const question: CaseQuestion | null = !input
    ? null
    : state.deductibleConflict
      ? {
          path: 'conflict',
          title: 'How much of your deductible is left?',
          reason:
            'The sample benefits summary and your note disagree. Confirm the remaining deductible before we calculate.',
          kind: 'conflict',
        }
      : (nextQuestion(input) ??
        (state.documentNeeded
          ? {
              path: 'document',
              title: 'Do you have the estimate from your dentist?',
              reason:
                'The estimate gives each procedure’s fee and planned date. A file can be attached locally, but this demo does not interpret it.',
              kind: 'document',
            }
          : null));
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [sample, setSample] = useState(false);
  const [voice, setVoice] = useState<'idle' | 'listening' | 'confirm'>('idle');
  const [rules, setRules] = useState(false);
  useEffect(() => {
    setAmount('');
    setChoice('');
    setError('');
    setUnknown(false);
    setSample(false);
    setVoice('idle');
  }, [question?.path]);
  useEffect(() => {
    if (voice !== 'listening') return;
    const timer = setTimeout(() => setVoice('confirm'), 650);
    return () => clearTimeout(timer);
  }, [voice]);
  if (!input)
    return (
      <div className="page narrow">
        <Card>
          <h2>No case to review</h2>
          <Button onClick={() => navigate('/')}>Start on Home</Button>
        </Card>
      </div>
    );
  if (!question)
    return (
      <div className="page narrow centered">
        <Orb size={150} success />
        <h2>The important details are filled in</h2>
        <p className="muted">
          Review them together before calculating your comparison.
        </p>
        <Button onClick={() => navigate('/facts')}>
          Review confirmed details
        </Button>
      </div>
    );
  const paid = question.path.endsWith('insurerAlreadyPaidCents');
  const year = currentYear(input);
  const label =
    paid && year?.[0] === 'py-2026'
      ? 'Insurer already paid in 2026'
      : question.kind === 'conflict'
        ? 'Remaining deductible'
        : question.kind === 'date'
          ? 'Benefit year start date'
          : fieldLabel(input, question.path);
  const submit = () => {
    if (question.kind === 'rules') {
      setRules(true);
      return;
    }
    let value: unknown = choice;
    if (question.kind === 'money' || question.kind === 'conflict') {
      value = parseMoney(amount);
      if (value === null) {
        setError('Enter a valid amount with up to two decimal places.');
        return;
      }
    } else if (question.kind === 'date') {
      if (!validDate(amount)) {
        setError('Choose a valid date.');
        return;
      }
      value = amount;
    } else if (
      question.kind === 'choice' &&
      (!choice || choice === 'unknown')
    ) {
      if (!choice) setError('Choose an answer to continue.');
      else setUnknown(true);
      return;
    }
    const draft = structuredClone(input);
    if (question.kind === 'conflict') {
      if (!year || year[1].annualDeductibleCents === null) {
        setRules(true);
        return;
      }
      if ((value as number) > year[1].annualDeductibleCents) {
        setError('Remaining deductible cannot exceed the annual deductible.');
        return;
      }
      draft.planYears[year[0]].deductibleAlreadyMetCents =
        year[1].annualDeductibleCents - (value as number);
    } else setField(draft, question.path, value);
    const error = validateCase(draft);
    if (error) {
      setError(error);
      return;
    }
    edit((d) => Object.assign(d, draft));
    if (question.kind === 'conflict')
      setCaseFlags({ deductibleConflict: false });
    if (choice === 'self_pay') navigate('/self-pay');
  };
  return (
    <div className="page question-layout">
      <div className="question-orb">
        <Orb size={220} />
        <p className="small muted">Only what matters to your estimate.</p>
      </div>
      <Card className="question-card stack">
        <Badge tone={unknown ? 'warning' : 'green'}>
          {unknown
            ? 'Incomplete information'
            : question.kind === 'conflict'
              ? 'Conflicting details'
              : 'A quick detail'}
        </Badge>
        {unknown ? (
          <>
            <PageHeading
              title="We need this before an insured estimate"
              description="Unknown values stay unknown. We won't turn them into a zero-dollar cost."
            />
            <Notice tone="warning">
              Check your insurer portal, benefits summary or dentist’s estimate
              for this detail. Your other answers are preserved.
            </Notice>
            <div className="actions">
              <Button onClick={() => setUnknown(false)}>
                Answer this detail
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/intake/upload')}
              >
                Add evidence
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Finish later
              </Button>
            </div>
          </>
        ) : (
          <>
            <PageHeading
              title={question.title}
              description="Choose the answer that matches your current information."
            />
            <div className="why-ask">
              <strong>Why we ask</strong>
              <p className="small muted">{question.reason}</p>
            </div>
            {question.kind === 'document' ? (
              <>
                <div className="actions">
                  <Button
                    icon={FileText}
                    onClick={() => navigate('/intake/upload')}
                  >
                    Choose file
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate('/intake/photo')}
                  >
                    Sample photo
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setCaseFlags({
                        documentNeeded: false,
                        documentDeclined: true,
                      })
                    }
                  >
                    I don't have it
                  </Button>
                </div>
                <Notice>
                  You can continue with manually entered fees. Sample fees
                  remain clearly labeled when using the fictional case.
                </Notice>
              </>
            ) : question.kind === 'rules' ? (
              <>
                <Notice tone="warning">{question.reason}</Notice>
                <Button onClick={() => setRules(true)}>
                  Review coverage rules
                </Button>
                <Button variant="secondary" onClick={() => navigate('/facts')}>
                  Review procedure amounts
                </Button>
              </>
            ) : (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {question.kind === 'choice' ? (
                  <fieldset className="choice-group">
                    <legend className="visually-hidden">
                      {question.path === 'coverageMode'
                        ? 'Insurance status'
                        : 'Network status'}
                    </legend>
                    {question.options!.map((o) => (
                      <label
                        key={o.value}
                        className={`choice ${choice === o.value ? 'checked' : ''}`}
                      >
                        <input
                          type="radio"
                          name="answer"
                          value={o.value}
                          checked={choice === o.value}
                          onChange={() => {
                            setChoice(o.value);
                            setError('');
                          }}
                        />
                        {o.label}
                      </label>
                    ))}
                    {error && (
                      <p className="field-error" role="alert">
                        {error}
                      </p>
                    )}
                  </fieldset>
                ) : (
                  <>
                    <Field label={label} error={error}>
                      {question.kind === 'date' ? (
                        <input
                          type="date"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      ) : (
                        <div className="money-input large">
                          <span>$</span>
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={amount}
                            placeholder="Amount"
                            onChange={(e) => {
                              setAmount(e.target.value);
                              setSample(false);
                              setError('');
                            }}
                          />
                        </div>
                      )}
                    </Field>
                    {sample && (
                      <Badge>
                        Sample amount ·{' '}
                        {question.kind === 'date'
                          ? amount
                          : money(parseMoney(amount) ?? 0)}
                      </Badge>
                    )}
                    {paid && (
                      <div className="actions">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setAmount('500');
                            setSample(true);
                            setError('');
                          }}
                        >
                          Use sample amount
                        </Button>
                        <Button
                          variant="secondary"
                          icon={Mic}
                          busy={voice === 'listening'}
                          onClick={() => setVoice('listening')}
                        >
                          {voice === 'listening'
                            ? 'Listening for sample answer…'
                            : 'Sample voice answer'}
                        </Button>
                        <Button
                          variant="ghost"
                          icon={FileText}
                          onClick={() => navigate('/intake/upload')}
                        >
                          Add evidence
                        </Button>
                      </div>
                    )}
                    {voice === 'confirm' && (
                      <div className="voice-confirmation" role="status">
                        <strong>We heard (sample)</strong>
                        <blockquote>
                          “They’ve paid about five hundred dollars so far this
                          year.”
                        </blockquote>
                        <p>
                          That sounds like <strong>$500</strong>. Is that right?
                        </p>
                        <div className="actions">
                          <Button
                            onClick={() => {
                              setAmount('500');
                              setSample(true);
                              setVoice('idle');
                            }}
                          >
                            Yes, use $500
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setVoice('idle')}
                          >
                            Discard
                          </Button>
                        </div>
                      </div>
                    )}
                    {question.path === 'benefitStart' &&
                      state.origin === 'sample' && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setAmount('2026-01-01');
                            setSample(true);
                          }}
                        >
                          Use sample date (Jan 1, 2026)
                        </Button>
                      )}
                    {question.kind === 'conflict' && (
                      <div className="actions">
                        <Button
                          variant="secondary"
                          onClick={() => setAmount('0')}
                        >
                          Deductible already met
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={year?.[1].annualDeductibleCents == null}
                          onClick={() => {
                            const deductible = year?.[1].annualDeductibleCents;
                            if (deductible != null)
                              setAmount(String(deductible / 100));
                          }}
                        >
                          Full deductible remains
                        </Button>
                      </div>
                    )}
                  </>
                )}
                <div className="actions">
                  <Button type="submit" disabled={voice !== 'idle'}>
                    Confirm answer
                  </Button>
                  <Button variant="ghost" onClick={() => setUnknown(true)}>
                    I don't know
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>
      {rules && (
        <CaseEditor section="coverage" onClose={() => setRules(false)} />
      )}
    </div>
  );
}
