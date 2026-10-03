import { z } from 'zod';

/**
 * Upper bound for any money value: $1,000,000,000.00 in cents.
 * Chosen so that cents × 10000 basis points stays below Number.MAX_SAFE_INTEGER,
 * which lets the engine do exact integer rate arithmetic without a decimal library.
 */
export const MAX_CENTS = 100_000_000_000;
export const MAX_BASIS_POINTS = 10_000;

/** Nonnegative integer USD cents. Rejects NaN, Infinity, fractions and negatives. */
export const CentsSchema = z.number().int().min(0).max(MAX_CENTS);

/** Integer basis points, 0–10000 (10000 = 100%). */
export const BasisPointsSchema = z.number().int().min(0).max(MAX_BASIS_POINTS);

/** Stable identifier: letters, digits, hyphen, underscore; starts with a letter or digit. */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, digits, hyphens or underscores');

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** Calendar date without time or timezone, e.g. `2026-11-12`. Used for treatment and benefit periods. */
export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, 'Expected a real calendar date in YYYY-MM-DD form');

/** UTC timestamp for events, e.g. `2026-10-03T15:00:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime();

/**
 * Field paths address plan years and procedures by ID, never by array index,
 * e.g. `planYears.py-2026.insurerAlreadyPaidCents` or `procedures.crown-1.allowedCents`.
 */
export const FieldPathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/, 'Expected a dot-separated field path');

export const CurrencySchema = z.literal('USD');

export type Cents = z.infer<typeof CentsSchema>;
export type BasisPoints = z.infer<typeof BasisPointsSchema>;
export type IsoDate = z.infer<typeof IsoDateSchema>;
export type FieldPath = z.infer<typeof FieldPathSchema>;
