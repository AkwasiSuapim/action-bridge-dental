import {
  CentsSchema,
  IsoDateSchema,
  type DentalCaseInput,
  type Policy,
  type Procedure,
  type SourceFact,
} from '@actionbridge/contracts';
import { z } from 'zod';

/**
 * What the model may propose from the user's own description (T5-01). Every group carries a quote
 * copied word for word from the description; values without supporting text are dropped. Proposals
 * change nothing until the user confirms them.
 */
const Quote = z.string().min(3).max(300).describe('Exact words copied from the user description that state these facts');
const Category = z.enum(['preventive', 'basic', 'major']);

export const ExtractionSchema = z.strictObject({
  coverageMode: z
    .strictObject({ value: z.enum(['insured', 'self_pay']), quote: Quote })
    .optional()
    .describe('Only if the user says whether they have dental insurance'),
  benefitYear: z
    .strictObject({
      startDate: IsoDateSchema.optional().describe('YYYY-MM-DD, only if stated'),
      endDate: IsoDateSchema.optional().describe('YYYY-MM-DD, only if stated'),
      annualMaximumCents: CentsSchema.optional(),
      insurerAlreadyPaidCents: CentsSchema.optional().describe('What the insurer already paid this benefit year'),
      annualDeductibleCents: CentsSchema.optional(),
      deductibleAlreadyMetCents: CentsSchema.optional(),
      quote: Quote,
    })
    .optional(),
  coverageRules: z
    .array(
      z.strictObject({
        category: Category,
        insurerPaysPercent: z.number().min(0).max(100).describe('Percentage the plan pays for this category'),
        deductibleApplies: z.boolean().optional(),
        quote: Quote,
      }),
    )
    .max(3)
    .optional(),
  planRestrictions: z
    .array(
      z.strictObject({
        kind: z.enum(['waiting_period', 'exclusion', 'frequency_limit']),
        description: z.string().min(3).max(200).describe('e.g. "12-month waiting period for crowns"'),
        quote: Quote,
      }),
    )
    .max(5)
    .optional()
    .describe('Any waiting period, exclusion or frequency limit the description mentions'),
  procedures: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(120),
        category: Category.describe('Usual benefit class: cleanings preventive, fillings basic, crowns major. The user confirms it.'),
        providerChargeCents: CentsSchema.optional(),
        allowedCents: CentsSchema.optional(),
        contractualWriteoffCents: CentsSchema.optional(),
        network: z.enum(['in', 'out']).optional(),
        proposedDate: IsoDateSchema.optional(),
        dentistEarliestDate: IsoDateSchema.optional(),
        dentistLatestDate: IsoDateSchema.optional(),
        timingStatedBy: z.enum(['dentist', 'user']).optional().describe('Who said the timing is flexible'),
        selfPayQuoteCents: CentsSchema.optional().describe('Only an explicit cash price from the dentist'),
        quote: Quote,
      }),
    )
    .max(6)
    .optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type FactGroup =
  | { kind: 'coverageMode'; fieldPath: 'coverageMode'; summary: string; quote: string; value: 'insured' | 'self_pay' }
  | { kind: 'benefitYear'; fieldPath: string; summary: string; quote: string; planYearId: string; startDate: string | null; endDate: string | null; values: Partial<Record<PlanYearMoney, number>> }
  | { kind: 'coverageRules'; fieldPath: 'policy'; summary: string; quote: string; rules: { category: string; bps: number; deductibleApplies: boolean | null }[] }
  | { kind: 'restrictions'; fieldPath: 'policy'; summary: string; quote: string; restrictions: { kind: 'waiting_period' | 'exclusion' | 'frequency_limit'; description: string }[] }
  | { kind: 'procedure'; fieldPath: string; summary: string; quote: string; procedure: Procedure };

type PlanYearMoney = 'annualMaximumCents' | 'insurerAlreadyPaidCents' | 'annualDeductibleCents' | 'deductibleAlreadyMetCents';

export interface Dropped {
  group: string;
  field: string;
  reason: 'quote_not_in_description' | 'amount_not_in_quote' | 'benefit_year_dates_not_stated';
}

/**
 * Whitespace- and case-insensitive containment, tolerant of curly quotes. A quote may join several
 * exact fragments with "…" (or "..."); every fragment must appear word for word.
 */
export function quoteAppears(quote: string, text: string): boolean {
  const fragments = fragmentsOf(quote);
  return fragments.length > 0 && fragments.every((f) => f.length >= 3 && norm(text).includes(norm(f)));
}

/**
 * The fragments of a quote that appear word for word in the description, joined with " … ", or
 * null if none do. Values are then checked against this verified text only.
 */
export function verifiedQuote(quote: string, text: string): string | null {
  const kept = fragmentsOf(quote).filter((f) => f.length >= 3 && norm(text).includes(norm(f)));
  return kept.length > 0 ? kept.join(' … ') : null;
}

function norm(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

function fragmentsOf(quote: string): string[] {
  return quote.split(/\s*(?:…|\.\.\.)\s*/).map((f) => f.trim()).filter((f) => f.length > 0);
}

/**
 * Money amounts written in a quote ("$1,000", "250", "75.50"), as cents. Zero also counts when
 * the quote says it in words ("haven't met it", "none", "nothing", "zero").
 */
function amountsIn(quote: string): Set<number> {
  const found = new Set<number>();
  if (/\b(?:not|none|nothing|zero|no)\b|n['’]t\b/i.test(quote)) found.add(0);
  for (const match of quote.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)) {
    const [whole, fraction = ''] = match[0].replace(/,/g, '').split('.');
    found.add(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
  }
  return found;
}

function percentsIn(quote: string): Set<number> {
  return new Set([...quote.matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)/gi)].map((m) => Number(m[1])));
}

const money = (cents: number) => `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;

/**
 * Turns a validated extraction into reviewable groups. Each group's quote must appear in the
 * description and each amount must appear in its quote; anything else is dropped and reported.
 */
export function groupsFromExtraction(
  extraction: Extraction,
  text: string,
  current: DentalCaseInput,
  today: string,
): { groups: FactGroup[]; dropped: Dropped[] } {
  const groups: FactGroup[] = [];
  const dropped: Dropped[] = [];

  if (extraction.coverageMode) {
    const { value, quote } = extraction.coverageMode;
    if (quoteAppears(quote, text)) {
      groups.push({
        kind: 'coverageMode',
        fieldPath: 'coverageMode',
        quote,
        value,
        summary: value === 'insured' ? 'You have dental insurance for this treatment' : 'You will pay for this treatment yourself',
      });
    } else dropped.push({ group: 'coverageMode', field: 'coverageMode', reason: 'quote_not_in_description' });
  }

  if (extraction.benefitYear) {
    const { quote, startDate, endDate, ...rest } = extraction.benefitYear;
    if (!quoteAppears(quote, text)) {
      dropped.push({ group: 'benefitYear', field: 'benefitYear', reason: 'quote_not_in_description' });
    } else {
      const amounts = amountsIn(quote);
      const values: Partial<Record<PlanYearMoney, number>> = {};
      for (const [field, cents] of Object.entries(rest) as [PlanYearMoney, number | undefined][]) {
        if (cents === undefined) continue;
        if (amounts.has(cents)) values[field] = cents;
        else dropped.push({ group: 'benefitYear', field, reason: 'amount_not_in_quote' });
      }
      const existingIds = Object.keys(current.planYears);
      const planYearId = startDate ? planYearIdFor(startDate) : existingIds.length === 1 ? (existingIds[0] as string) : null;
      if (planYearId === null) {
        for (const field of Object.keys(values)) dropped.push({ group: 'benefitYear', field, reason: 'benefit_year_dates_not_stated' });
      } else if (startDate || Object.keys(values).length > 0) {
        const end = endDate ?? (startDate ? twelveMonthsFrom(startDate) : null);
        const parts = [
          startDate ? `${startDate} to ${end}${endDate ? '' : ' (12 months)'}` : 'Your current benefit year',
          values.annualMaximumCents !== undefined ? `annual maximum ${money(values.annualMaximumCents)}` : null,
          values.insurerAlreadyPaidCents !== undefined ? `insurer already paid ${money(values.insurerAlreadyPaidCents)}` : null,
          values.annualDeductibleCents !== undefined ? `deductible ${money(values.annualDeductibleCents)}` : null,
          values.deductibleAlreadyMetCents !== undefined ? `deductible met ${money(values.deductibleAlreadyMetCents)}` : null,
        ].filter(Boolean);
        groups.push({ kind: 'benefitYear', fieldPath: `planYears.${planYearId}`, quote, planYearId, startDate: startDate ?? null, endDate: end, values, summary: parts.join(' · ') });
      }
    }
  }

  const rules = (extraction.coverageRules ?? []).filter((rule) => {
    const ok = quoteAppears(rule.quote, text) && percentsIn(rule.quote).has(rule.insurerPaysPercent);
    if (!ok) dropped.push({ group: 'coverageRules', field: rule.category, reason: quoteAppears(rule.quote, text) ? 'amount_not_in_quote' : 'quote_not_in_description' });
    return ok;
  });
  if (rules.length > 0) {
    groups.push({
      kind: 'coverageRules',
      fieldPath: 'policy',
      quote: rules.map((r) => r.quote).join(' … ').slice(0, 300),
      rules: rules.map((r) => ({ category: r.category, bps: Math.round(r.insurerPaysPercent * 100), deductibleApplies: r.deductibleApplies ?? null })),
      summary: `Your plan pays ${rules.map((r) => `${r.insurerPaysPercent}% for ${r.category}`).join(', ')}`,
    });
  }

  const restrictions = (extraction.planRestrictions ?? []).filter((r) => {
    const ok = quoteAppears(r.quote, text);
    if (!ok) dropped.push({ group: 'restrictions', field: r.kind, reason: 'quote_not_in_description' });
    return ok;
  });
  if (restrictions.length > 0) {
    groups.push({
      kind: 'restrictions',
      fieldPath: 'policy',
      quote: restrictions.map((r) => r.quote).join(' … ').slice(0, 300),
      restrictions: restrictions.map(({ kind, description }) => ({ kind, description })),
      summary: `Your plan has limits: ${restrictions.map((r) => r.description).join('; ')}`.slice(0, 200),
    });
  }

  const usedIds = new Set(current.procedures.map((p) => p.id));
  let next = current.procedures.length + 1;
  for (const p of extraction.procedures ?? []) {
    const verified = verifiedQuote(p.quote, text);
    if (verified === null) {
      dropped.push({ group: 'procedure', field: p.label, reason: 'quote_not_in_description' });
      continue;
    }
    const amounts = amountsIn(verified);
    const keep = (field: string, cents: number | undefined): number | null => {
      if (cents === undefined) return null;
      if (amounts.has(cents)) return cents;
      dropped.push({ group: 'procedure', field: `${p.label}.${field}`, reason: 'amount_not_in_quote' });
      return null;
    };
    // Dates and network status must be stated somewhere in the source text, not inferred.
    const statedDate = (field: string, value: string | undefined): string | null => {
      if (value === undefined) return null;
      if (text.includes(value)) return value;
      dropped.push({ group: 'procedure', field: `${p.label}.${field}`, reason: 'quote_not_in_description' });
      return null;
    };
    const networkStated = p.network === 'in' ? /\bin[- ]network\b/i.test(text) : p.network === 'out' ? /\bout[- ]of[- ]network\b/i.test(text) : false;
    if (p.network && !networkStated) dropped.push({ group: 'procedure', field: `${p.label}.network`, reason: 'quote_not_in_description' });
    const network = networkStated && p.network ? p.network : null;
    const proposedDate = statedDate('proposedDate', p.proposedDate);
    const earliest = statedDate('dentistEarliestDate', p.dentistEarliestDate);
    const latest = statedDate('dentistLatestDate', p.dentistLatestDate);
    while (usedIds.has(`proc-${next}`)) next++;
    const id = `proc-${next}`;
    usedIds.add(id);
    const charge = keep('providerChargeCents', p.providerChargeCents);
    const selfPay = keep('selfPayQuoteCents', p.selfPayQuoteCents);
    const dentistWindow = p.timingStatedBy === 'dentist' && earliest !== null && latest !== null;
    const procedure: Procedure = {
      id,
      label: p.label,
      cdtCode: null,
      category: p.category,
      network: network ?? 'unknown',
      providerChargeCents: charge,
      allowedCents: keep('allowedCents', p.allowedCents),
      contractualWriteoffCents: keep('contractualWriteoffCents', p.contractualWriteoffCents),
      proposedDate,
      dentistEarliestDate: earliest,
      dentistLatestDate: latest,
      // Timing reported through the user never unlocks the optimizer (D-14).
      timingSource: dentistWindow ? 'dentist_supplied' : earliest || latest ? 'user_reported' : 'unknown',
      prerequisiteIds: [],
      selfPayQuote: selfPay === null ? null : { amountCents: selfPay, quotedOn: today, source: 'user_reported', includedScope: p.label },
    };
    const parts = [
      `${p.label} (${p.category} service)`,
      charge !== null ? `charge ${money(charge)}` : null,
      procedure.allowedCents !== null ? `allowed ${money(procedure.allowedCents)}` : null,
      network ? (network === 'in' ? 'in network' : 'out of network') : null,
      proposedDate ? `planned ${proposedDate}` : null,
      dentistWindow ? `dentist allows ${earliest} to ${latest}` : null,
      selfPay !== null ? `cash quote ${money(selfPay)}` : null,
    ].filter(Boolean);
    groups.push({ kind: 'procedure', fieldPath: `procedures.${id}`, quote: verified, procedure, summary: parts.join(' · ').slice(0, 200) });
  }

  return { groups, dropped };
}

export function planYearIdFor(startDate: string): string {
  return startDate.endsWith('-01-01') ? `py-${startDate.slice(0, 4)}` : `py-${startDate.slice(0, 7)}`;
}

function twelveMonthsFrom(start: string): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y + 1, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Applies confirmed groups to the case. Plan rules the engine supports are recorded as visible
 * assumptions (same model as the coverage-rules screen); unanswered rules stay unknown.
 */
export function applyGroups(
  current: DentalCaseInput,
  groups: FactGroup[],
  makeFact: (fieldPath: string, value: string | number | boolean | null, quote: string | null, origin: SourceFact['origin']) => SourceFact,
): { input: DentalCaseInput; facts: SourceFact[] } {
  let input = structuredClone(current);
  const facts: SourceFact[] = [];
  for (const group of groups) {
    switch (group.kind) {
      case 'coverageMode':
        input = { ...input, coverageMode: group.value };
        facts.push(makeFact('coverageMode', group.value, group.quote, 'agent_proposed'));
        break;
      case 'benefitYear': {
        const existing = input.planYears[group.planYearId];
        const start = group.startDate ?? existing?.startDate;
        const end = group.endDate ?? existing?.endDate;
        if (!start || !end) break;
        input.planYears[group.planYearId] = {
          startDate: start,
          endDate: end,
          annualMaximumCents: group.values.annualMaximumCents ?? existing?.annualMaximumCents ?? null,
          insurerAlreadyPaidCents: group.values.insurerAlreadyPaidCents ?? existing?.insurerAlreadyPaidCents ?? null,
          annualDeductibleCents: group.values.annualDeductibleCents ?? existing?.annualDeductibleCents ?? null,
          deductibleAlreadyMetCents: group.values.deductibleAlreadyMetCents ?? existing?.deductibleAlreadyMetCents ?? null,
          sourceStatus: 'user_confirmed',
        };
        for (const [field, value] of Object.entries(group.values)) {
          facts.push(makeFact(`planYears.${group.planYearId}.${field}`, value, group.quote, 'agent_proposed'));
        }
        break;
      }
      case 'restrictions': {
        const policy = input.policy ?? emptyPolicy();
        if (input.policy === null) {
          facts.push(makeFact('policy.deductibleBeforeCoinsurance', true, null, 'assumption'));
        }
        const field = { waiting_period: 'waitingPeriods', exclusion: 'exclusions', frequency_limit: 'frequencyRestrictions' } as const;
        const next: Policy = { ...policy, waitingPeriods: [...policy.waitingPeriods], exclusions: [...policy.exclusions], frequencyRestrictions: [...policy.frequencyRestrictions] };
        group.restrictions.forEach((r, i) => {
          const list = next[field[r.kind]];
          list.push({ id: `agent-${r.kind.replace('_', '-')}-${list.length + i + 1}`, description: r.description, categoryIds: [] });
          facts.push(makeFact(`policy.${field[r.kind]}`, r.description, group.quote, 'agent_proposed'));
        });
        // A stated limit means coverage is not "all services covered": the engine then reports it as
        // unsupported, and any earlier "all services covered" assumption no longer applies.
        input = { ...input, policy: { ...next, allServicesCovered: false } };
        for (let i = facts.length - 1; i >= 0; i--) if (facts[i]?.fieldPath === 'policy.allServicesCovered') facts.splice(i, 1);
        break;
      }
      case 'coverageRules': {
        const policy: Policy = input.policy ?? emptyPolicy();
        if (input.policy === null) {
          facts.push(makeFact('policy.deductibleBeforeCoinsurance', true, null, 'assumption'));
          facts.push(makeFact('policy.allServicesCovered', true, null, 'assumption'));
        }
        const next = { ...policy, insurerRateBpsByCategory: { ...policy.insurerRateBpsByCategory }, deductibleAppliesByCategory: { ...policy.deductibleAppliesByCategory } };
        for (const rule of group.rules) {
          next.insurerRateBpsByCategory[rule.category] = rule.bps;
          facts.push(makeFact(`policy.insurerRateBpsByCategory.${rule.category}`, rule.bps, group.quote, 'agent_proposed'));
          if (rule.deductibleApplies !== null) {
            next.deductibleAppliesByCategory[rule.category] = rule.deductibleApplies;
            facts.push(makeFact(`policy.deductibleAppliesByCategory.${rule.category}`, rule.deductibleApplies, group.quote, 'agent_proposed'));
          }
        }
        input = { ...input, policy: next };
        break;
      }
      case 'procedure':
        input = { ...input, procedures: [...input.procedures, group.procedure] };
        facts.push(makeFact(group.fieldPath, group.procedure.label, group.quote, 'agent_proposed'));
        break;
    }
  }
  return { input, facts };
}

/** The supported plan model, with nothing plan-specific filled in (same shape as the coverage-rules screen). */
function emptyPolicy(): Policy {
  return {
    id: 'member-plan',
    deductibleBeforeCoinsurance: true,
    deductibleAppliesByCategory: {},
    insurerRateBpsByCategory: {},
    annualMaximumAppliesByCategory: {},
    rounding: 'half_up_to_cent',
    allServicesCovered: true,
    waitingPeriods: [],
    exclusions: [],
    frequencyRestrictions: [],
  };
}
