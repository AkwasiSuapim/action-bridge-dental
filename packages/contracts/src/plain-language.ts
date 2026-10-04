import type { Scenario } from './estimate.js';
import type { JobStageEvent } from './job.js';

/**
 * Plain-language wording shared by the web and mobile apps, so both explain the same things the
 * same way. Text only: no rules or amounts live here.
 */

export interface Term {
  term: string;
  /** One short sentence a first-time reader can follow. */
  definition: string;
}

const TERMS = {
  coverage: { term: 'Dental insurance', definition: 'Whether a dental plan will help pay for this treatment.' },
  benefitYear: { term: 'Benefit year', definition: 'The 12 months your plan’s limits run on. They reset every year, often on January 1.' },
  annualMaximum: { term: 'Annual maximum', definition: 'The most your insurer will pay for your dental care in one benefit year. After that, you pay the rest.' },
  alreadyPaid: { term: 'Insurer already paid this year', definition: 'What your insurer has paid for your care so far this benefit year. It uses up part of your annual maximum.' },
  deductible: { term: 'Deductible', definition: 'What you pay yourself each benefit year before your insurer starts paying.' },
  deductibleMet: { term: 'Deductible already met', definition: 'How much of this year’s deductible you have already paid.' },
  planPays: { term: 'Plan pays %', definition: 'After the deductible, the share of the cost your plan covers, for example 80% for fillings.' },
  deductibleApplies: { term: 'Deductible applies', definition: 'Whether you pay the deductible first for this type of service.' },
  maximumApplies: { term: 'Counts toward the maximum', definition: 'Whether what your plan pays for this service uses up your annual maximum.' },
  serviceType: { term: 'Service type', definition: 'How your plan groups the treatment (for example basic or major). Each group has its own percentage.' },
  procedure: { term: 'Recommended treatment', definition: 'A treatment your dentist recommended, with its price.' },
  network: { term: 'In network', definition: 'Your dentist has a contract with your insurer, which usually means lower prices.' },
  charge: { term: 'Dentist’s charge', definition: 'The full price the dentist lists, before insurance.' },
  allowed: { term: 'Allowed amount', definition: 'The price your insurer agreed with in-network dentists for this treatment.' },
  writeoff: { term: 'Write-off', definition: 'The part of the fee an in-network dentist agrees not to charge you.' },
  plannedDate: { term: 'Planned date', definition: 'When the treatment is booked or planned. It decides which benefit year pays.' },
  window: { term: 'Dentist’s timing window', definition: 'The dates your dentist says the treatment can safely happen. We never suggest dates outside it.' },
  restrictions: { term: 'Plan limits', definition: 'Waiting periods, exclusions or frequency limits that can stop your plan paying for a treatment.' },
  selfPay: { term: 'Self-pay quote', definition: 'The dentist’s written cash price if you pay without insurance.' },
} satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;
export const GLOSSARY: Record<TermKey, Term> = TERMS;

/**
 * The term behind a field path or question, e.g. `planYears.py-2026.annualMaximumCents` or
 * `procedures.all.network`. Null when there is nothing worth explaining.
 */
export function termFor(fieldPath: string): Term | null {
  const parts = fieldPath.split('.');
  const [root] = parts;
  const last = parts[parts.length - 1] ?? '';
  if (root === 'coverageMode') return TERMS.coverage;
  if (root === 'planYears') {
    if (parts.length <= 2 || last === 'startDate' || last === 'endDate') return TERMS.benefitYear;
    if (last === 'annualMaximumCents') return TERMS.annualMaximum;
    if (last === 'insurerAlreadyPaidCents') return TERMS.alreadyPaid;
    if (last === 'annualDeductibleCents') return TERMS.deductible;
    if (last === 'deductibleAlreadyMetCents') return TERMS.deductibleMet;
    return TERMS.benefitYear;
  }
  if (root === 'policy') {
    const map = parts[1] ?? '';
    if (map === 'insurerRateBpsByCategory' || parts.length === 1) return TERMS.planPays;
    if (map === 'deductibleAppliesByCategory' || map === 'deductibleBeforeCoinsurance') return TERMS.deductibleApplies;
    if (map === 'annualMaximumAppliesByCategory') return TERMS.maximumApplies;
    if (map === 'waitingPeriods' || map === 'exclusions' || map === 'frequencyRestrictions' || map === 'allServicesCovered') return TERMS.restrictions;
    return TERMS.planPays;
  }
  if (root === 'procedures') {
    if (parts.length <= 2) return TERMS.procedure;
    if (last === 'network') return TERMS.network;
    if (last === 'providerChargeCents') return TERMS.charge;
    if (last === 'allowedCents') return TERMS.allowed;
    if (last === 'contractualWriteoffCents') return TERMS.writeoff;
    if (last === 'proposedDate') return TERMS.plannedDate;
    if (last === 'dentistEarliestDate' || last === 'dentistLatestDate' || last === 'timingSource' || last === 'window') return TERMS.window;
    if (last === 'category') return TERMS.serviceType;
    if (last === 'selfPayQuote') return TERMS.selfPay;
    return TERMS.procedure;
  }
  return null;
}

/** One line of the assistant's progress list, built from real stage events only. */
export interface JobStep {
  key: string;
  /** What is happening, e.g. "Reading document 1". */
  label: string;
  status: 'active' | 'done' | 'skipped' | 'failed';
  /** The result once done, e.g. "Read 42 lines of text". */
  result: string | null;
  startedAt: string;
  /** A short, honest note for steps that can take a while. */
  hint: string | null;
}

const SLOW_HINTS: [RegExp, string][] = [
  [/^Reading (your )?document/i, 'Long PDFs can take 20–30 seconds.'],
  [/^Listening/i, 'Usually about 10 seconds.'],
  [/^(Understanding|Reading your description)/i, 'Usually 5–10 seconds.'],
];

/**
 * Turns the job's stage events into a checklist: each "started" event opens a step and the next
 * completed/skipped/failed event for the same stage closes it. A completion without a start is
 * shown as its own finished step. No invented stages, percentages or timings.
 */
export function jobSteps(events: readonly JobStageEvent[]): JobStep[] {
  const steps: JobStep[] = [];
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.status === 'started') {
      steps.push({
        key: `${event.stage}-${event.sequence}`,
        label: event.summary,
        status: 'active',
        result: null,
        startedAt: event.at,
        hint: SLOW_HINTS.find(([pattern]) => pattern.test(event.summary))?.[1] ?? null,
      });
      continue;
    }
    const open = [...steps].reverse().find((s) => s.status === 'active' && s.key.startsWith(`${event.stage}-`));
    const status = event.status === 'completed' ? 'done' : event.status;
    if (open) {
      open.status = status;
      open.result = event.summary;
    } else {
      steps.push({ key: `${event.stage}-${event.sequence}`, label: event.summary, status, result: null, startedAt: event.at, hint: null });
    }
  }
  return steps;
}

// ---- "What this means for you" ------------------------------------------------------------

/** "$1,200" or "$1,200.50": whole dollars without cents. */
export function plainMoney(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100).toLocaleString('en-US');
  const rest = Math.abs(cents) % 100;
  return `${cents < 0 ? '-' : ''}$${dollars}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "January 15, 2027" from an ISO date, without time zones. */
export function plainDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export interface PlainSummary {
  /** Short paragraphs, in reading order. */
  paragraphs: string[];
  /** The same text as one string, for reading aloud. */
  speech: string;
}

interface SummaryInput {
  comparison: Scenario;
  alternative: Scenario | null;
  outcome: 'alternatives_found' | 'no_lower_cost_alternative' | 'no_flexible_timing' | 'comparison_incomplete';
  procedures: { id: string; label: string; dentistLatestDate: string | null }[];
  selfPay: { totalCents: number; minusInsuredCents: number | null } | null;
}

/**
 * Plain-language explanation of the calculator's results, built only from its numbers (no AI).
 * Money values all come from the server; the one derived figure is what is left of the current
 * year's maximum before treatment (maximum minus reported paid), which both apps already show.
 */
export function plainSummary({ comparison: baseline, alternative, outcome, procedures, selfPay }: SummaryInput): PlainSummary {
  const label = (id: string) => procedures.find((p) => p.id === id)?.label.toLowerCase() ?? 'treatment';
  const totals = baseline.estimate.totals;
  const paragraphs: string[] = [
    `If you do everything as planned, you pay about ${plainMoney(totals.patientPaysCents)} and your plan pays ${plainMoney(totals.insurerPaysCents)}.`,
  ];

  const firstYear = Object.values(baseline.estimate.yearProjections)[0];
  if (firstYear) {
    const left = Math.max(0, firstYear.annualMaximumCents - firstYear.reportedInsurerPaidCents);
    const capped = baseline.estimate.lines.some((l) => l.capShortfallCents > 0);
    paragraphs.push(
      capped
        ? `Your plan has only ${plainMoney(left)} left of its ${plainMoney(firstYear.annualMaximumCents)} yearly maximum, so part of your treatment isn't covered this year.`
        : `Your plan has ${plainMoney(left)} left of its ${plainMoney(firstYear.annualMaximumCents)} yearly maximum this year.`,
    );
  }

  if (alternative) {
    const moved = alternative.schedule.filter((s) => alternative.movedProcedureIds.includes(s.procedureId));
    const what = moved.map((s) => `the ${label(s.procedureId)} on ${plainDate(s.date)}`).join(' and ');
    const latest = moved
      .map((s) => procedures.find((p) => p.id === s.procedureId)?.dentistLatestDate)
      .find((d): d is string => Boolean(d));
    paragraphs.push(
      `If your dentist does ${what || 'some treatment later'}${latest ? ` (they said it can safely wait until ${plainDate(latest)})` : ''}, a new benefit year starts and your plan pays again: you'd pay about ${plainMoney(alternative.estimate.totals.patientPaysCents)}, which is ${plainMoney(alternative.differenceFromBaselineCents)} less.` +
        (alternative.conditional ? ' This assumes next year’s plan stays the same.' : ''),
    );
  } else if (outcome === 'no_flexible_timing') {
    paragraphs.push('Your dentist didn’t give a window for moving any treatment, so I kept your original dates.');
  } else if (outcome === 'comparison_incomplete') {
    paragraphs.push('Moving treatment into next year could change the cost, but I need next year’s plan details to compare it.');
  } else {
    paragraphs.push('Moving treatment within your dentist’s window wouldn’t lower your cost, so the original dates are your best option.');
  }

  if (selfPay) {
    const diff = selfPay.minusInsuredCents;
    paragraphs.push(
      diff === null || diff === 0
        ? `Paying cash without insurance would cost ${plainMoney(selfPay.totalCents)}.`
        : `Paying cash without insurance would cost ${plainMoney(selfPay.totalCents)}, ${plainMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than using your plan.`,
    );
  }
  paragraphs.push('These are estimates. Your dentist decides the timing and your insurer decides the final payment.');
  return { paragraphs, speech: paragraphs.join(' ') };
}

// ---- Voice guidance ------------------------------------------------------------------------

/**
 * Text as it should be spoken: ISO dates become "January 1, 2026", "$800.00" becomes "$800",
 * separators and quotation marks are dropped, so the voice never says "dot" or "middle dot".
 */
export function speakable(text: string): string {
  return text
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => plainDate(iso))
    .replace(/\$(\d[\d,]*)\.00\b/g, '$$$1')
    .replace(/\s*[·•|]\s*/g, ', ')
    .replace(/[“”"«»]/g, '')
    .replace(/\s*\((D\d{4})\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SpokenAnswer = 'yes' | 'no' | 'unknown';

/**
 * What a short spoken reply means, by fixed rules (no AI): "not right" before "right", and
 * "I don't know" before either. Null when the reply is unclear, so the app asks again.
 */
export function spokenAnswer(transcript: string): SpokenAnswer | null {
  const said = ` ${transcript.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (/ (i )?(don't|do not|dont) know | not sure | no idea | skip /.test(said)) return 'unknown';
  if (/ (not right|not correct|incorrect|wrong|no|nope|nah|not really) /.test(said)) return 'no';
  if (/ (yes|yeah|yep|yup|right|correct|that's right|thats right|sure|ok|okay|confirm|true|use it|continue|go ahead) /.test(said)) return 'yes';
  return null;
}

/** Which offered option a spoken reply names, by the option's distinctive words. */
export function spokenChoice(transcript: string, options: { id: string; label: string }[]): string | null {
  const said = new Set(transcript.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const stop = new Set(['the', 'a', 'of', 'for', 'and', 'all', 'these', 'my', 'it', 'is', 'to']);
  const scored = options.map((option) => {
    const words = option.label.toLowerCase().split(/[^a-z]+/).filter((w) => w && !stop.has(w));
    const hits = words.filter((w) => said.has(w)).length;
    return { id: option.id, score: words.length ? hits / words.length : 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  return best && best.score > 0 && (!second || best.score > second.score) ? best.id : null;
}
