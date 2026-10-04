import type {
  JobAnswersRequest,
  MissingFieldBlock,
  UiBlockEnvelope,
} from '@actionbridge/contracts';
import { validDate } from './case-fields';
import { parseMoney } from './model';

/**
 * What the user has entered for one assistant question before validation (same model as the
 * mobile app): a confirmation, a choice, typed text, or "I don't know".
 */
export type Draft =
  | { kind: 'confirm'; value: boolean }
  | { kind: 'choice'; optionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'unknown' };

export type Drafts = Record<string, Draft>;

export function questionsOf(
  envelope: UiBlockEnvelope | null | undefined,
): MissingFieldBlock[] {
  return (envelope?.blocks ?? []).flatMap((b) =>
    b.type === 'missing_field' ? [b] : [],
  );
}

/** Confirmations default to "yes": the user only acts on what is wrong. */
export function initialDrafts(questions: MissingFieldBlock[]): Drafts {
  return Object.fromEntries(
    questions
      .filter((q) => q.inputType === 'fact_review')
      .map((q) => [q.questionId, { kind: 'confirm', value: true } as Draft]),
  );
}

/** Validates every answer and builds the request, or lists what still needs attention. Unknown is never sent as 0. */
export function buildAnswers(
  questions: MissingFieldBlock[],
  drafts: Drafts,
  expectedRevision: number,
):
  | { ok: true; request: JobAnswersRequest }
  | { ok: false; problems: { questionId: string; message: string }[] } {
  const problems: { questionId: string; message: string }[] = [];
  const answers: JobAnswersRequest['answers'] = [];
  for (const q of questions) {
    const draft = drafts[q.questionId];
    const base = { questionId: q.questionId, attachmentId: null };
    if (!draft) {
      problems.push({
        questionId: q.questionId,
        message: 'Answer this, or choose “I don’t know”.',
      });
      continue;
    }
    if (draft.kind === 'unknown') {
      answers.push({
        ...base,
        value: null,
        unknown: true,
        responseMode: 'tap',
      });
      continue;
    }
    switch (q.inputType) {
      case 'fact_review':
        if (draft.kind === 'confirm')
          answers.push({
            ...base,
            value: draft.value,
            unknown: false,
            responseMode: 'tap',
          });
        else
          problems.push({
            questionId: q.questionId,
            message: 'Choose “Yes” or “Not right”.',
          });
        break;
      case 'single_select':
        if (
          draft.kind === 'choice' &&
          q.options.some((o) => o.id === draft.optionId)
        )
          answers.push({
            ...base,
            value: draft.optionId,
            unknown: false,
            responseMode: 'tap',
          });
        else
          problems.push({
            questionId: q.questionId,
            message: 'Choose one option, or “I don’t know”.',
          });
        break;
      case 'currency': {
        const cents = draft.kind === 'text' ? parseMoney(draft.text) : null;
        if (cents === null)
          problems.push({
            questionId: q.questionId,
            message: 'Enter dollars and cents, for example 1200.00.',
          });
        else if (q.maximumCents !== undefined && cents > q.maximumCents)
          problems.push({
            questionId: q.questionId,
            message: 'That amount is higher than this question allows.',
          });
        else
          answers.push({
            ...base,
            value: cents,
            unknown: false,
            responseMode: 'type',
          });
        break;
      }
      case 'date': {
        const text = draft.kind === 'text' ? draft.text.trim() : '';
        if (!validDate(text))
          problems.push({
            questionId: q.questionId,
            message: 'Enter a real date.',
          });
        else
          answers.push({
            ...base,
            value: text,
            unknown: false,
            responseMode: 'type',
          });
        break;
      }
      default:
        problems.push({
          questionId: q.questionId,
          message: 'This question needs a document, which isn’t available yet.',
        });
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, request: { expectedRevision, answers } };
}

const TERMINAL = new Set([
  'needs_information',
  'completed',
  'failed',
  'cancelled',
]);
export const isTerminal = (status: string) => TERMINAL.has(status);

/** Poll quickly at first (the agent usually answers in a few seconds), then back off, capped. */
export function pollDelayMs(attempt: number): number {
  return Math.min(4000, 800 + attempt * 400);
}
