import { describe, expect, it } from 'vitest';
import { emptyDraft, validateDraft } from './draft';
import { errorsForStep, firstStepWithErrors, stepOf, stepsFor } from './form-steps';

describe('Form steps', () => {
  it('asks about the plan only when the user is insured', () => {
    expect(stepsFor('insured')).toEqual(['coverage', 'treatment', 'plan']);
    expect(stepsFor('self_pay')).toEqual(['coverage', 'treatment']);
    expect(stepsFor(null)).toEqual(['coverage', 'treatment']);
  });

  it('shows each step only its own errors, and finds the first step to fix', () => {
    expect(['coverage', 'procedures', 'procedures.0.label', 'rules.yearStart', 'money.deductible'].map(stepOf)).toEqual(['coverage', 'treatment', 'treatment', 'plan', 'plan']);
    const errors = validateDraft(emptyDraft('p-1'));
    expect(Object.keys(errorsForStep(errors, 'coverage'))).toEqual(['coverage']);
    expect(Object.keys(errorsForStep(errors, 'treatment')).every((k) => k.startsWith('procedures'))).toBe(true);
    expect(firstStepWithErrors(errors, stepsFor(null))).toBe('coverage');
    expect(firstStepWithErrors({}, stepsFor('insured'))).toBeNull();
  });
});
