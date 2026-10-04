import {
  CreateCaseRequestSchema,
  type CreateCaseRequest,
} from '@actionbridge/contracts';
import fixture from '../../../docs/fixtures/dental-regression.json';

/**
 * The shared, explicitly fictional regression fixture, loaded from docs/fixtures so the site,
 * the mobile app and the API tests can never drift apart. Always labeled "Sample data".
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

/** A case with nothing in it yet, for the composer (the assistant fills it after confirmation). */
export function emptyCaseRequest(): CreateCaseRequest {
  return {
    currency: 'USD',
    coverageMode: 'unknown',
    policy: null,
    planYears: {},
    procedures: [],
  };
}
