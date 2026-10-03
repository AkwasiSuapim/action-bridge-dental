import type { DentalCase } from '@actionbridge/contracts';
import { randomUUID } from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { ErrorNotice } from '../../components/states';
import { AppText, Button, ChoiceChips, MoneyField, Notice, Screen, TextField } from '../../components/ui';
import { answerChanges, type FactValue } from '../../lib/edits';
import { centsToInput, formatCents, formatDate, isIsoDate, parseDollarsToCents } from '../../lib/format';
import type { QuestionSpec } from '../../lib/questions';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { space } from '../../theme/tokens';

/**
 * One focused question for one field (design v3 question card): the question, why it matters,
 * the smallest suitable control and an "I don't know" route. Used to edit a single value and,
 * one after another, by the question loop. Unknown is saved as null, never 0.
 */
export function QuestionForm({
  record,
  question,
  current,
  reload,
  onDone,
  header,
  saveLabel = 'Save',
}: {
  record: DentalCase;
  question: QuestionSpec;
  current: unknown;
  reload: () => Promise<unknown>;
  /** Called after a successful save, or with `skipped` when the answer is unknown and nothing changed. */
  onDone: (outcome: 'saved' | 'skipped') => void;
  header?: ReactNode;
  saveLabel?: string;
}) {
  const api = useApi();
  const [money, setMoney] = useState({ text: typeof current === 'number' ? centsToInput(current) : '', unknown: false });
  const [choice, setChoice] = useState<string | null>(
    question.kind === 'choice' ? (question.options.find((option) => option.value === current)?.id ?? null) : null,
  );
  const [dateText, setDateText] = useState(typeof current === 'string' ? current : '');
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const procedureId = question.fieldPath.startsWith('procedures.') ? question.fieldPath.split('.')[1] : undefined;
  const procedure = procedureId ? record.procedures.find((p) => p.id === procedureId) : undefined;
  const charge = question.fieldPath.endsWith('.allowedCents') ? procedure?.providerChargeCents : null;

  /** The validated value to save, or a message saying what to fix. */
  const readValue = (): { value: FactValue } | { problem: string } => {
    switch (question.kind) {
      case 'currency': {
        if (money.unknown) return { value: null };
        const cents = parseDollarsToCents(money.text);
        return cents === null ? { problem: 'Enter dollars and cents, for example 1200.00, or choose “I don’t know”.' } : { value: cents };
      }
      case 'choice': {
        const option = question.options.find((o) => o.id === choice);
        return option ? { value: option.value as FactValue } : { problem: 'Choose one, or tap “I don’t know”.' };
      }
      case 'date':
        if (dateText.trim() === '') return { problem: 'Enter a date, or tap “I don’t know”.' };
        return isIsoDate(dateText.trim()) ? { value: dateText.trim() } : { problem: 'Enter a real date as YYYY-MM-DD, for example 2026-11-12.' };
      case 'edit_case':
        return { problem: 'This detail can’t be changed here yet.' };
    }
  };

  const submit = async (value: FactValue) => {
    // Answering "unknown" to something already unknown changes nothing: skip without a write.
    if (value === null && (current === null || current === undefined)) {
      onDone('skipped');
      return;
    }
    setBusy(true);
    setProblem(null);
    setFailure(null);
    try {
      const changes = answerChanges(record, question.fieldPath, value, { now: () => new Date(), newId: randomUUID });
      await api.patchCase(record.caseId, { expectedRevision: record.caseRevision, changes });
      await reload();
      onDone(value === null ? 'skipped' : 'saved');
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') {
        await reload();
        setNotice('This case changed since you opened it. We loaded the latest details — check your answer and save again.');
      } else {
        setFailure(apiError);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (busy) return;
    const read = readValue();
    if ('problem' in read) {
      setProblem(read.problem);
      AccessibilityInfo.announceForAccessibility(read.problem);
      return;
    }
    void submit(read.value);
  };

  const window =
    procedure?.dentistEarliestDate && procedure.dentistLatestDate
      ? `Your dentist’s window: ${formatDate(procedure.dentistEarliestDate)} – ${formatDate(procedure.dentistLatestDate)}.`
      : undefined;
  const clear = () => setProblem(null);

  return (
    <Screen
      footer={
        question.kind === 'edit_case' ? null : (
          <>
            <Button label={saveLabel} onPress={save} loading={busy} />
            {question.kind === 'currency' ? null : (
              <Button label="I don’t know" variant="ghost" onPress={() => !busy && void submit(null)} />
            )}
          </>
        )
      }
    >
      {header}
      <View style={{ gap: space(2) }}>
        <AppText variant="title">{question.label}</AppText>
        <AppText muted>{question.reason}</AppText>
      </View>

      {notice ? <Notice tone="warning" title={notice} /> : null}
      {failure ? <ErrorNotice error={failure} /> : null}

      {question.kind === 'currency' ? (
        <>
          <MoneyField
            label="Amount in US dollars"
            text={money.text}
            unknown={money.unknown}
            onChange={(next) => {
              setMoney(next);
              clear();
            }}
          />
          {charge !== null && charge !== undefined && !money.unknown ? (
            <Button
              label={`Same as the dentist’s charge (${formatCents(charge)})`}
              variant="secondary"
              onPress={() => {
                setMoney({ text: centsToInput(charge), unknown: false });
                clear();
              }}
            />
          ) : null}
        </>
      ) : null}

      {question.kind === 'choice' ? (
        <ChoiceChips
          label="Choose one"
          options={question.options.map((option) => ({ id: option.id, label: option.label }))}
          value={choice}
          onChange={(id) => {
            setChoice(id);
            clear();
          }}
        />
      ) : null}

      {question.kind === 'date' ? (
        <TextField
          label="Date (YYYY-MM-DD)"
          value={dateText}
          onChangeText={(text) => {
            setDateText(text);
            clear();
          }}
          placeholder="2026-11-12"
          keyboardType="numbers-and-punctuation"
          {...(window ? { helper: window } : {})}
        />
      ) : null}

      {question.kind === 'edit_case' ? <Notice tone="info" title={question.label} body="This detail can’t be changed here yet." /> : null}
      {problem ? <Notice tone="danger" title={problem} /> : null}
    </Screen>
  );
}
