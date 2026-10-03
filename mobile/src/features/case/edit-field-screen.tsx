import type { DentalCase } from '@actionbridge/contracts';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Button, ChoiceChips, MoneyField, Notice, Screen, TextField } from '../../components/ui';
import { userEditChanges, valueAt, type FactValue } from '../../lib/edits';
import { centsToInput, formatDate, isIsoDate, parseDollarsToCents } from '../../lib/format';
import { questionFor, type QuestionSpec } from '../../lib/questions';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { space } from '../../theme/tokens';
import { useCase } from './case-store';

/**
 * One focused question for one field (design v3 question card): the question, why it matters,
 * the smallest suitable control and an "I don't know" route. Saving records the value as
 * provided by the user; it never marks anything insurer-verified.
 */
export function EditFieldScreen() {
  const { caseId, field } = useLocalSearchParams<{ caseId: string; field: string }>();
  const { record, loading, error, reload } = useCase(caseId);

  if (loading) return <LoadingState label="Loading this detail" />;
  if (!record || !field) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading this detail" />;

  const question = questionFor({ fieldPath: field, code: 'VALUE_UNKNOWN', message: 'This detail can’t be changed here yet.' }, record);
  // Keyed by field only: a conflict reload updates `record` but keeps what the user typed.
  return <EditForm key={field} question={question} current={valueAt(record, field)} reload={reload} record={record} />;
}

function EditForm({
  question,
  current,
  reload,
  record,
}: {
  question: QuestionSpec;
  current: unknown;
  reload: () => Promise<unknown>;
  record: DentalCase;
}) {
  const api = useApi();
  const [money, setMoney] = useState({ text: typeof current === 'number' ? centsToInput(current) : '', unknown: current === null });
  const [choice, setChoice] = useState<string | null>(
    question.kind === 'choice' ? (question.options.find((option) => option.value === current)?.id ?? null) : null,
  );
  const [dateText, setDateText] = useState(typeof current === 'string' ? current : '');
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The validated value to save, or a message saying what to fix. Unknown is null, never 0. */
  const readValue = (): { value: FactValue } | { problem: string } => {
    switch (question.kind) {
      case 'currency': {
        if (money.unknown) return { value: null };
        const cents = parseDollarsToCents(money.text);
        return cents === null ? { problem: 'Enter dollars and cents, for example 1200.00, or choose “I don’t know”.' } : { value: cents };
      }
      case 'choice': {
        const option = question.options.find((o) => o.id === choice);
        return option ? { value: option.value as FactValue } : { problem: 'Choose one option.' };
      }
      case 'date':
        if (dateText.trim() === '') return { value: null };
        return isIsoDate(dateText.trim()) ? { value: dateText.trim() } : { problem: 'Enter a real date as YYYY-MM-DD, for example 2026-11-12.' };
      case 'edit_case':
        return { problem: 'This detail can’t be changed here yet.' };
    }
  };

  const save = async () => {
    if (busy) return;
    const read = readValue();
    if ('problem' in read) {
      setProblem(read.problem);
      AccessibilityInfo.announceForAccessibility(read.problem);
      return;
    }
    setBusy(true);
    setProblem(null);
    setFailure(null);
    try {
      const changes = userEditChanges(record, question.fieldPath, read.value, { now: () => new Date(), newId: randomUUID });
      await api.patchCase(record.caseId, { expectedRevision: record.caseRevision, changes });
      await reload();
      router.back();
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') {
        await reload();
        setNotice('This case changed since you opened it. We loaded the latest details — check the value and save again.');
      } else {
        setFailure(apiError);
      }
    } finally {
      setBusy(false);
    }
  };

  const procedureId = question.fieldPath.startsWith('procedures.') ? question.fieldPath.split('.')[1] : undefined;
  const procedure = procedureId ? record.procedures.find((p) => p.id === procedureId) : undefined;
  const window =
    procedure?.dentistEarliestDate && procedure.dentistLatestDate
      ? `Your dentist’s window: ${formatDate(procedure.dentistEarliestDate)} – ${formatDate(procedure.dentistLatestDate)}.`
      : undefined;

  return (
    <Screen
      footer={
        question.kind === 'edit_case' ? (
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        ) : (
          <Button label="Save" onPress={save} loading={busy} />
        )
      }
    >
      <View style={{ gap: space(2) }}>
        <AppText variant="title">{question.label}</AppText>
        <AppText muted>{question.reason}</AppText>
      </View>

      {notice ? <Notice tone="warning" title={notice} /> : null}
      {failure ? <ErrorNotice error={failure} /> : null}

      {question.kind === 'currency' ? (
        <MoneyField
          label="Amount in US dollars"
          text={money.text}
          unknown={money.unknown}
          onChange={(next) => {
            setMoney(next);
            setProblem(null);
          }}
        />
      ) : null}

      {question.kind === 'choice' ? (
        <ChoiceChips
          label="Choose one"
          options={question.options.map((option) => ({ id: option.id, label: option.label }))}
          value={choice}
          onChange={(id) => {
            setChoice(id);
            setProblem(null);
          }}
        />
      ) : null}

      {question.kind === 'date' ? (
        <TextField
          label="Date (YYYY-MM-DD)"
          value={dateText}
          onChangeText={(text) => {
            setDateText(text);
            setProblem(null);
          }}
          placeholder="2026-11-12"
          keyboardType="numbers-and-punctuation"
          helper={window ?? 'Leave empty if you don’t know yet.'}
        />
      ) : null}

      {problem ? <Notice tone="danger" title={problem} /> : null}

      <AppText variant="caption" muted>
        We’ll label this “Provided by you”. It isn’t confirmed by your insurer.
      </AppText>
    </Screen>
  );
}
