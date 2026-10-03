import { CreateCaseRequestSchema, type CreateCaseRequest } from '@actionbridge/contracts';
import fixture from '../../../../docs/fixtures/dental-regression.json';

/**
 * The shared, explicitly fictional regression fixture ($1,200 vs $725), loaded from
 * docs/fixtures so the app, API tests and engine tests can never drift apart.
 * Always shown with a "Synthetic sample" label.
 */
export function sampleCaseRequest(): CreateCaseRequest {
  return CreateCaseRequestSchema.parse({
    currency: fixture.currency,
    coverageMode: fixture.coverageMode,
    policy: fixture.policy,
    planYears: fixture.planYears,
    procedures: fixture.procedures,
  });
}
