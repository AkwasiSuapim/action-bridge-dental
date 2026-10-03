/**
 * Bump on any change that can alter a calculated amount. Every result carries this value so a
 * stored estimate can be traced to the rules that produced it.
 *
 * 0.1.0 — individual PPO coinsurance/maximum policy; deductible before coinsurance;
 *         half-up rounding to the cent on each line's insurer payment; sequential per-plan-year
 *         deductible and maximum accounting; forward-only next-plan-year candidate dates (D-01).
 */
export const ENGINE_VERSION = '0.1.0';

export const ROUNDING_POLICY = 'half_up_to_cent';

/** MVP bound from the project brief: up to six procedures, so at most 2^6 schedule assignments. */
export const MAX_PROCEDURES = 6;
export const MAX_SCHEDULE_ASSIGNMENTS = 2 ** MAX_PROCEDURES;
