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
import { money, parseMoney } from '../../domain/model';
import { useDemo } from '../../state/demo-store';
import { missingQuestion } from './facts-page';

export function QuestionsPage() {
  const { state, edit } = useDemo();
  const navigate = useNavigate();
  const question = state.input ? missingQuestion(state.input) : null;
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [voice, setVoice] = useState(false);
  const [sample, setSample] = useState(false);
  useEffect(() => {
    setChoice('');
    setAmount('');
    setError('');
    setUnknown(false);
    setSample(false);
  }, [question]);
  useEffect(() => {
    if (!voice) return;
    const timer = setTimeout(() => {
      setAmount('500');
      setSample(true);
      setVoice(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [voice]);
  if (!state.input)
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
  const submit = () => {
    if (question === 'paid') {
      const cents = parseMoney(amount);
      if (
        cents === null ||
        cents > state.input!.planYears['py-2026'].annualMaximumCents!
      ) {
        setError(
          `Enter an amount from $0 to ${money(state.input!.planYears['py-2026'].annualMaximumCents!)}.`,
        );
        return;
      }
      edit((input) => {
        input.planYears['py-2026'].insurerAlreadyPaidCents = cents;
      });
    } else {
      if (!choice) {
        setError('Choose an answer to continue.');
        return;
      }
      if (choice === 'self_pay') {
        edit((input) => {
          input.coverageMode = 'self_pay';
        });
        navigate('/self-pay');
        return;
      }
      if (choice === 'unknown') {
        if (question === 'coverage')
          edit((input) => {
            input.coverageMode = choice as 'unknown' | 'self_pay';
          });
        setUnknown(true);
        return;
      }
      edit((input) => {
        if (question === 'coverage') input.coverageMode = 'insured';
        else
          input.procedures.forEach((p) => {
            p.network = choice as 'in' | 'out';
          });
      });
    }
  };
  return (
    <div className="page question-layout">
      <div className="question-orb">
        <Orb size={220} />
        <p className="small muted">Only what matters to your estimate.</p>
      </div>
      <Card className="question-card stack">
        <Badge tone={unknown ? 'warning' : 'green'}>
          {unknown ? 'Incomplete information' : 'A quick detail'}
        </Badge>
        {unknown ? (
          <>
            <PageHeading
              title="We need this before an insured estimate"
              description="Unknown values stay unknown. We won't turn them into a zero-dollar cost."
            />
            <Notice tone="warning">
              {question === 'paid'
                ? 'Check your insurer portal or a current benefits statement for the amount already paid this year.'
                : question === 'coverage'
                  ? 'Confirm whether this treatment is covered by a current dental plan. Self-pay prices can be reviewed separately.'
                  : 'Ask your dentist or insurer whether this provider is in network for your particular plan.'}
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
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <PageHeading
              title={
                question === 'paid'
                  ? 'How much has your insurer already paid this benefit year?'
                  : question === 'coverage'
                    ? 'Do you have dental insurance for this treatment?'
                    : 'Is your dentist in network for your plan?'
              }
              description={
                question === 'paid'
                  ? 'Use the insurer payment amount, not the total dentist charges.'
                  : 'Choose the answer that matches your current information.'
              }
            />
            <div className="why-ask">
              <strong>Why we ask</strong>
              <p className="small muted">
                {question === 'paid'
                  ? 'This determines how much of your annual insurer maximum remains for the proposed treatment.'
                  : question === 'coverage'
                    ? 'The rules for an insured estimate differ from a cash quote.'
                    : 'Network terms can change allowed amounts, write-offs and balance billing.'}
              </p>
            </div>
            {question === 'paid' ? (
              <>
                <Field label="Insurer already paid in 2026" error={error}>
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
                </Field>
                {sample && <Badge>Sample amount · $500</Badge>}
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
                    busy={voice}
                    onClick={() => setVoice(true)}
                  >
                    {voice ? 'Preparing sample answer…' : 'Sample voice answer'}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={FileText}
                    onClick={() => navigate('/intake/upload')}
                  >
                    Add evidence
                  </Button>
                </div>
                <p className="small muted">
                  Voice answers are simulated and require your confirmation.
                </p>
              </>
            ) : (
              <fieldset className="choice-group">
                <legend className="visually-hidden">
                  {question === 'coverage'
                    ? 'Insurance status'
                    : 'Network status'}
                </legend>
                {(question === 'coverage'
                  ? [
                      { value: 'insured', label: 'I have dental insurance' },
                      { value: 'self_pay', label: 'Self-pay' },
                      { value: 'unknown', label: 'Not sure' },
                    ]
                  : [
                      { value: 'in', label: 'In network' },
                      { value: 'out', label: 'Out of network' },
                      { value: 'unknown', label: 'Not sure' },
                    ]
                ).map((option) => (
                  <label
                    className={`choice ${choice === option.value ? 'checked' : ''}`}
                    key={option.value}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={option.value}
                      checked={choice === option.value}
                      onChange={() => {
                        setChoice(option.value);
                        setError('');
                      }}
                    />
                    {option.label}
                  </label>
                ))}
                {error && <p className="field-error">{error}</p>}
              </fieldset>
            )}
            <div className="actions">
              <Button type="submit">Confirm answer</Button>
              <Button variant="ghost" onClick={() => setUnknown(true)}>
                I don't know
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
