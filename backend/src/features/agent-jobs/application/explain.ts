import type { ScenarioComparison } from '@actionbridge/contracts';
import type { AgentModel } from '../ports.js';

const SYSTEM = `You explain a dental cost estimate that a calculator already produced. Write at most three short, plain sentences.
Use only the figures provided, written exactly as given. Do not add, round or combine amounts.
If an option is conditional, say what it depends on. Never say an option is better care, safe to delay, or guaranteed.`;

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Optional natural-language explanation of engine results (T5-03 explain step). Every dollar
 * amount in the reply must be one of the engine's own figures; otherwise the reply is discarded
 * and the app shows its deterministic summary instead.
 */
export async function explainComparison(model: AgentModel, comparison: ScenarioComparison): Promise<string | null> {
  const baseline = comparison.baseline.estimate.totals;
  const facts = {
    allTreatmentNow: { youPay: formatCents(baseline.patientPaysCents), planPays: formatCents(baseline.insurerPaysCents) },
    alternatives: comparison.alternatives.map((a) => ({
      change: `${a.movedProcedureIds.join(', ')} moved to the next benefit year within the dentist's window`,
      youPay: formatCents(a.estimate.totals.patientPaysCents),
      estimatedDifference: formatCents(a.differenceFromBaselineCents),
      conditionalOn: a.conditional ? 'next year’s coverage staying the same' : null,
    })),
    outcome: comparison.outcome,
  };
  const allowed = new Set<string>([
    facts.allTreatmentNow.youPay,
    facts.allTreatmentNow.planPays,
    ...facts.alternatives.flatMap((a) => [a.youPay, a.estimatedDifference]),
  ]);

  const reply = await model.converse({ system: SYSTEM, messages: [{ role: 'user', content: [{ text: JSON.stringify(facts) }] }], tools: [], maxTokens: 300 });
  const text = reply.content.flatMap((block) => ('text' in block ? [block.text] : [])).join(' ').trim();
  if (!text || text.length > 500) return null;
  const amounts = text.match(/-?\$\d[\d,]*(?:\.\d{2})?/g) ?? [];
  return amounts.every((amount) => allowed.has(amount.includes('.') ? amount : `${amount}.00`)) ? text : null;
}
