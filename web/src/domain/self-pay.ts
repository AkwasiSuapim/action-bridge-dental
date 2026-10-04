import type { DentalCase, PatchCaseRequest } from '@actionbridge/contracts';
import { parseMoney } from './model';

export const QUOTE_SCOPE =
  'Same service as the treatment estimate, confirmed by you';

/** Text for each procedure's cash-price field; empty when there is no quote. */
export function quoteTexts(record: DentalCase): Record<string, string> {
  return Object.fromEntries(
    record.procedures.map((p) => [
      p.id,
      p.selfPayQuote ? (p.selfPayQuote.amountCents / 100).toFixed(2) : '',
    ]),
  );
}

/**
 * PATCH for the dentist's cash quotes (same rules as mobile). An empty field removes that quote
 * (unknown, never $0); a typed $0 is a real $0 quote. Returns field errors when anything is wrong.
 */
export function selfPayChanges(
  record: DentalCase,
  texts: Record<string, string>,
  scopeConfirmed: boolean,
  today: string,
):
  | { changes: PatchCaseRequest['changes'] }
  | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amounts = new Map<string, number | null>();
  for (const procedure of record.procedures) {
    const text = (texts[procedure.id] ?? '').trim();
    if (text === '') amounts.set(procedure.id, null);
    else {
      const cents = parseMoney(text);
      if (cents === null)
        errors[procedure.id] =
          'Enter dollars and cents, for example 1200.00, or leave it empty.';
      else amounts.set(procedure.id, cents);
    }
  }
  if ([...amounts.values()].some((v) => v !== null) && !scopeConfirmed)
    errors.scope =
      'Confirm each quote covers the same service as the estimate.';
  if (Object.keys(errors).length > 0) return { errors };
  const procedures = record.procedures.map((procedure) => {
    const amount = amounts.get(procedure.id) ?? null;
    if (amount === null) return { ...procedure, selfPayQuote: null };
    const unchanged = procedure.selfPayQuote?.amountCents === amount;
    return {
      ...procedure,
      selfPayQuote:
        unchanged && procedure.selfPayQuote
          ? procedure.selfPayQuote
          : {
              amountCents: amount,
              quotedOn: today,
              source: 'user_reported' as const,
              includedScope: QUOTE_SCOPE,
            },
    };
  });
  return { changes: { procedures } };
}

export function localToday(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
