import type { DentalCase, Scenario } from '@actionbridge/contracts';
import { formatDate } from '../../lib/format';

/** The one next step shown after saving: confirm the timing (if anything moved) or the fees. */
export function nextStepFor(record: DentalCase, scenario: Scenario): { title: string; question: string } {
  const moved = scenario.movedProcedureIds.map((id) => record.procedures.find((p) => p.id === id)?.label.toLowerCase() ?? id);
  const date = scenario.schedule.find((entry) => scenario.movedProcedureIds.includes(entry.procedureId))?.date;
  if (moved.length > 0 && date) {
    return { title: 'Confirm the timing with your dentist', question: `Can my ${moved.join(' and ')} be done on ${formatDate(date)} instead? Is that timing right for me?` };
  }
  return { title: 'Confirm your costs with your dentist', question: 'Is your fee for each procedure the same as my plan’s allowed amount?' };
}
