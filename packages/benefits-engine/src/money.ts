import { MAX_BASIS_POINTS } from '@actionbridge/contracts';

/** Thrown only for programming errors: a broken invariant means a bug, never a user input problem. */
export class EngineInvariantError extends Error {
  override readonly name = 'EngineInvariantError';
}

/**
 * `amountCents × rateBps / 10000`, rounded half up to the cent, using exact integer arithmetic.
 * Inputs are bounded by the contracts (MAX_CENTS × 10000 < 2^53), and the bound is re-checked here.
 */
export function applyRateHalfUp(amountCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new EngineInvariantError(`Invalid cents amount: ${amountCents}`);
  }
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_BASIS_POINTS) {
    throw new EngineInvariantError(`Invalid basis points: ${rateBps}`);
  }
  const shifted = amountCents * rateBps + MAX_BASIS_POINTS / 2;
  if (!Number.isSafeInteger(shifted)) {
    throw new EngineInvariantError('Rate multiplication exceeded the safe integer range');
  }
  return (shifted - (shifted % MAX_BASIS_POINTS)) / MAX_BASIS_POINTS;
}
