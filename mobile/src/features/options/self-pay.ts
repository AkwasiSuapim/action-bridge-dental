import type { DentalCase, PatchCaseRequest } from '@actionbridge/contracts';
import { centsToInput, parseDollarsToCents } from '../../lib/format';

export const QUOTE_SCOPE = 'Same service as the treatment estimate, confirmed by you';

export type QuoteTexts = Record<string, string>;

export function quoteTexts(record: DentalCase): QuoteTexts {
  return Object.fromEntries(record.procedures.map((p) => [p.id, p.selfPayQuote ? centsToInput(p.selfPayQuote.amountCents) : '']));
}

/**
 * PATCH for the dentist's cash quotes. An empty field removes that quote (unknown, never $0);
 * a typed $0 is kept as a real $0 quote. Returns field errors instead when anything is malformed.
 */
export function selfPayChanges(
  record: DentalCase,
  texts: QuoteTexts,
  scopeConfirmed: boolean,
  today: string,
): { changes: PatchCaseRequest['changes'] } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amounts = new Map<string, number | null>();
  for (const procedure of record.procedures) {
    const text = (texts[procedure.id] ?? '').trim();
    if (text === '') amounts.set(procedure.id, null);
    else {
      const cents = parseDollarsToCents(text);
      if (cents === null) errors[procedure.id] = 'Enter dollars and cents, for example 1200.00, or leave it empty.';
      else amounts.set(procedure.id, cents);
    }
  }
  if ([...amounts.values()].some((value) => value !== null) && !scopeConfirmed) {
    errors.scope = 'Confirm the quote covers the same service as the estimate.';
  }
  if (Object.keys(errors).length > 0) return { errors };

  const procedures = record.procedures.map((procedure) => {
    const amount = amounts.get(procedure.id) ?? null;
    if (amount === null) return { ...procedure, selfPayQuote: null };
    const unchanged = procedure.selfPayQuote?.amountCents === amount;
    return {
      ...procedure,
      selfPayQuote: unchanged && procedure.selfPayQuote
        ? procedure.selfPayQuote
        : { amountCents: amount, quotedOn: today, source: 'user_reported' as const, includedScope: QUOTE_SCOPE },
    };
  });
  return { changes: { procedures } };
}

/** Today's date on the device as YYYY-MM-DD (local calendar date, not UTC). */
export function localToday(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
