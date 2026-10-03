import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState } from '../../components/states';
import { valueAt } from '../../lib/edits';
import { questionFor } from '../../lib/questions';
import { useCase } from './case-store';
import { QuestionForm } from './question-form';

/** Edit one value from the facts review. */
export function EditFieldScreen() {
  const { caseId, field } = useLocalSearchParams<{ caseId: string; field: string }>();
  const { record, loading, error, reload } = useCase(caseId);

  if (loading) return <LoadingState label="Loading this detail" />;
  if (!record || !field) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading this detail" />;

  const question = questionFor({ fieldPath: field, code: 'VALUE_UNKNOWN', message: 'This detail' }, record);
  // Keyed by field only: a conflict reload updates `record` but keeps what the user typed.
  return <QuestionForm key={field} record={record} question={question} current={valueAt(record, field)} reload={reload} onDone={() => router.back()} />;
}
