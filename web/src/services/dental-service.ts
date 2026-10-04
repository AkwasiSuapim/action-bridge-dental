import {
  DentalCaseInputSchema,
  type DentalCaseInput,
  type Scenario,
  type ScenarioComparison,
} from '@actionbridge/contracts';
import {
  compareSchedules,
  estimateSchedule,
} from '@actionbridge/benefits-engine';
import fixture from '../../../docs/fixtures/dental-regression.json';

/** Integration seam: replace this adapter with HTTP requests without changing page components.
 * All insured amounts are produced by the shared deterministic engine, even in demo mode.
 */
export interface DentalService {
  compare(input: DentalCaseInput): ScenarioComparison;
}
export function sampleInput(paid: number | null = null): DentalCaseInput {
  const input = DentalCaseInputSchema.parse({
    caseRevision: 1,
    currency: fixture.currency,
    coverageMode: fixture.coverageMode,
    policy: fixture.policy,
    planYears: fixture.planYears,
    procedures: fixture.procedures,
  });
  input.planYears['py-2026'].insurerAlreadyPaidCents = paid;
  return input;
}
export const dentalService: DentalService = {
  compare(input) {
    const result = compareSchedules(input);
    if (result.status !== 'estimated')
      throw new Error(
        result.status === 'needs_information'
          ? result.missing.map((f) => f.message).join(' ')
          : 'These details cannot be compared. Review your information.',
      );
    // The web reference explicitly chooses Jan 10, inside the fixture's dentist window.
    // Estimate that permitted schedule with the same engine; do not change the shared fixture.
    const alternatives = result.alternatives.map((scenario): Scenario => {
      const crown = input.procedures.find((p) => p.id === 'crown-1');
      if (
        !crown?.dentistEarliestDate ||
        !crown.dentistLatestDate ||
        crown.dentistEarliestDate > '2027-01-10' ||
        crown.dentistLatestDate < '2027-01-10'
      )
        return scenario;
      const schedule = scenario.schedule.map((s) =>
        s.procedureId === 'crown-1' && s.date.startsWith('2027')
          ? { ...s, date: '2027-01-10' }
          : s,
      );
      const estimate = estimateSchedule(input, schedule);
      if (estimate.status !== 'estimated') return scenario;
      return {
        ...scenario,
        schedule,
        estimate,
        differenceFromBaselineCents:
          result.baseline.estimate.totals.patientPaysCents -
          estimate.totals.patientPaysCents,
      };
    });
    return { ...result, alternatives };
  },
};
