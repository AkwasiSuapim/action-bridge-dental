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
import { asApiError, type ApiError } from '../../services/api';
import { useCase } from '../../state/case-store';
import { ApiNotice } from '../assistant/assistant-page';
import {
  CoverageFields,
  CoverageStatus,
  TreatmentFields,
  validateCase,
} from './case-forms';

export function ManualPage() {
  const { create } = useCase();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
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
        eyebrow="Manual entry"
        title="Enter your details"
        description="Add what you know. Leave anything else empty and I’ll ask for it next. Use made-up details in this demo."
      />
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const error = validateCase(input);
          if (error) {
            setError(error);
            return;
          }
          setError('');
          setSaving(true);
          setFailure(null);
          try {
            const { caseRevision: _revision, ...request } = input;
            await create({
              ...request,
              policy: input.coverageMode === 'insured' ? input.policy : null,
            });
            navigate('/facts');
          } catch (caught) {
            setFailure(asApiError(caught));
          } finally {
            setSaving(false);
          }
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
        {failure && <ApiNotice error={failure} />}
        <FooterActions note="Prices and rules you enter are saved to your account and are not verified with your insurer.">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button type="submit" busy={saving}>
            Continue to review
          </Button>
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
  const { record, update } = useCase();
  const [input, setInput] = useState<DentalCaseInput>(() =>
    structuredClone(record!),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
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
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const error = validateCase(input);
          if (error) {
            setError(error);
            return;
          }
          setError('');
          setSaving(true);
          setFailure(null);
          try {
            await update(input);
            onClose();
          } catch (caught) {
            setFailure(asApiError(caught));
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="muted small">
          Saving updates your case and recalculates. Unknown values stay
          unknown.
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
        {failure && <ApiNotice error={failure} />}
        <div className="actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
