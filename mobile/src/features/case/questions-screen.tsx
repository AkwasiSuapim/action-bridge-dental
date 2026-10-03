import type { EstimateResult } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { valueAt } from '../../lib/edits';
import { questionFor } from '../../lib/questions';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { space } from '../../theme/tokens';
import { useCase } from './case-store';
import { QuestionForm } from './question-form';
import { nextStep } from './question-loop';

/**
 * Adaptive question loop (doc 05): the engine decides what is missing; the user answers one
 * question at a time, or says they don't know. Ends on the facts review.
 */
export function QuestionsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  const revision = record?.caseRevision;
  const check = useCallback(async () => {
    if (!caseId || revision === undefined) return;
    setFailure(null);
    try {
      setEstimate(await api.estimate(caseId, revision));
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') await reload();
      else setFailure(apiError);
    }
  }, [api, caseId, revision, reload]);

  useEffect(() => {
    void check();
  }, [check]);

  const finish = useCallback(() => {
    if (caseId) router.replace(`/case/${caseId}/facts`);
  }, [caseId]);

  const current = estimate && record && estimate.caseRevision === record.caseRevision ? estimate : null;
  const step = current ? nextStep(current.status === 'needs_information' ? current.missing : [], skipped) : null;

  useEffect(() => {
    if (step?.kind === 'done') finish();
  }, [step?.kind, finish]);

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;
  if (failure) {
    return (
      <Screen>
        <ErrorNotice error={failure} onRetry={check} />
      </Screen>
    );
  }
  if (!step || step.kind === 'done') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space(4), paddingVertical: space(10) }} accessible accessibilityLabel="Checking what is missing">
          <AgentOrb size={110} mode="active" />
          <AppText muted>Checking what’s missing…</AppText>
        </View>
      </Screen>
    );
  }

  const skip = (fieldPath: string) => setSkipped((current) => new Set(current).add(fieldPath));
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="label" muted>
        {step.kind === 'question' && step.remaining > 1 ? `A quick detail · ${step.remaining} left` : 'A quick detail'}
      </AppText>
      <Button label="Finish later" variant="ghost" onPress={finish} />
    </View>
  );

  if (step.kind === 'rules') {
    return (
      <Screen
        footer={
          <>
            <Button label="Add coverage details" onPress={() => router.push({ pathname: '/case/[caseId]/rules', params: { caseId: record.caseId } })} />
            <Button label="I don’t have it" variant="ghost" onPress={() => skip(step.fact.fieldPath)} />
          </>
        }
      >
        {header}
        <AppText variant="title">Add your plan’s coverage</AppText>
        <Card>
          <AppText muted>
            We need what your plan pays for each type of service and when its benefit year starts. Your benefits summary lists these.
          </AppText>
        </Card>
      </Screen>
    );
  }

  const question = questionFor(step.fact, record);
  return (
    <QuestionForm
      key={step.fact.fieldPath}
      record={record}
      question={question}
      current={valueAt(record, step.fact.fieldPath)}
      reload={reload}
      header={header}
      saveLabel="Continue"
      onDone={(outcome) => {
        if (outcome === 'skipped') skip(step.fact.fieldPath);
      }}
    />
  );
}
