import type { CaseDraft, DraftErrors } from './draft';

/** The Form in three short steps; "Your plan" only when the user has insurance. */
export type FormStep = 'coverage' | 'treatment' | 'plan';

export const STEP_TITLES: Record<FormStep, string> = {
  coverage: 'Coverage',
  treatment: 'Treatment',
  plan: 'Your plan',
};

export function stepsFor(coverage: CaseDraft['coverage']): FormStep[] {
  return coverage === 'insured' ? ['coverage', 'treatment', 'plan'] : ['coverage', 'treatment'];
}

/** Which step a validation error belongs to, so each step shows only its own problems. */
export function stepOf(errorKey: string): FormStep {
  if (errorKey === 'coverage') return 'coverage';
  if (errorKey === 'procedures' || errorKey.startsWith('procedures.')) return 'treatment';
  return 'plan';
}

export function errorsForStep(errors: DraftErrors, step: FormStep): DraftErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => stepOf(key) === step));
}

/** The first step (in order) that still has a problem, for jumping back on submit. */
export function firstStepWithErrors(errors: DraftErrors, steps: FormStep[]): FormStep | null {
  return steps.find((step) => Object.keys(errorsForStep(errors, step)).length > 0) ?? null;
}
