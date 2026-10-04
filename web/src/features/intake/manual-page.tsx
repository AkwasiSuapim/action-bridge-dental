import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DentalCaseInput } from '@actionbridge/contracts';
import {
  Button,
  Card,
  Dialog,
  FooterActions,
  Notice,
  PageHeading,
} from '../../components/ui';
import { emptyPolicy, emptyProcedure } from '../../domain/case-fields';
import { useDemo } from '../../state/demo-store';
import {
  CoverageFields,
  CoverageStatus,
  TreatmentFields,
  validateCase,
} from './case-forms';

export function ManualPage() {
  const { createCase } = useDemo();
  const navigate = useNavigate();
  const [input, setInput] = useState<DentalCaseInput>(() => ({
    caseRevision: 1,
    currency: 'USD',
    coverageMode: 'unknown',
    policy: emptyPolicy(),
    planYears: {},
    procedures: [emptyProcedure()],
  }));
  const [error, setError] = useState('');
  return (
    <div className="page medium">
      <PageHeading
        eyebrow="Manual entry · Demo mode"
        title="Tell us about your treatment"
        description="Add what you know. We’ll ask for missing details next. Use fictional data while backend services are being connected."
      />
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const error = validateCase(input);
          if (error) {
            setError(error);
            return;
          }
          createCase(input);
          navigate('/facts');
        }}
      >
        <Card>
          <CoverageStatus input={input} onChange={setInput} />
        </Card>
        <TreatmentFields input={input} onChange={setInput} />
        {input.coverageMode === 'insured' && (
          <CoverageFields input={input} onChange={setInput} />
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <FooterActions note="Prices and rules you enter are unverified. No information is sent to a server.">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button type="submit">Continue to review</Button>
        </FooterActions>
      </form>
    </div>
  );
}
export function CaseEditor({
  section,
  onClose,
}: {
  section: 'treatment' | 'coverage';
  onClose: () => void;
}) {
  const { state, edit } = useDemo();
  const [input, setInput] = useState(() => structuredClone(state.input!));
  const [error, setError] = useState('');
  return (
    <Dialog
      title={
        section === 'treatment' ? 'Edit your treatment' : 'Your plan’s coverage'
      }
      onClose={onClose}
      drawer
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const error = validateCase(input);
          if (error) {
            setError(error);
            return;
          }
          edit((draft) => Object.assign(draft, input));
          onClose();
        }}
      >
        <p className="muted small">
          Changes invalidate the current estimate. Unknown values stay unknown.
        </p>
        {section === 'treatment' ? (
          <TreatmentFields input={input} onChange={setInput} />
        ) : (
          <>
            <CoverageStatus input={input} onChange={setInput} />
            {input.coverageMode !== 'self_pay' && (
              <CoverageFields input={input} onChange={setInput} />
            )}
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
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
