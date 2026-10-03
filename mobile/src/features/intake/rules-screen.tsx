import type { DentalCase } from '@actionbridge/contracts';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Button, Notice, Screen } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { CATEGORIES, rulesChanges, rulesFromCase, usedCategories, validateRules, type Category, type DraftErrors } from './draft';
import { RulesFields } from './rules-fields';

/** Edit the plan's coverage rules (rates per service type, deductible rule, benefit-year start). */
export function RulesScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  if (loading) return <LoadingState label="Loading your plan" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your plan" />;
  return <RulesForm record={record} reload={reload} />;
}

function categoriesOf(record: DentalCase): Category[] {
  return usedCategories(record.procedures.map((p) => ({ category: CATEGORIES.some((c) => c.id === p.category) ? (p.category as Category) : null })));
}

function RulesForm({ record, reload }: { record: DentalCase; reload: () => Promise<unknown> }) {
  const api = useApi();
  const [rules, setRules] = useState(() => rulesFromCase(record));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsYear = Object.keys(record.planYears).length === 0;
  const categories = categoriesOf(record);

  const save = async () => {
    if (busy) return;
    const found = validateRules(rules, categories, needsYear);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      AccessibilityInfo.announceForAccessibility('Some details need fixing.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const changes = rulesChanges(record, rules, { now: () => new Date(), newId: randomUUID });
      await api.patchCase(record.caseId, { expectedRevision: record.caseRevision, changes });
      await reload();
      router.back();
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') {
        await reload();
        setNotice('This case changed since you opened it. We loaded the latest details — check and save again.');
      } else {
        setFailure(apiError);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label="Save" onPress={save} loading={busy} />}>
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Your plan’s coverage</AppText>
        <AppText muted>Use your benefits summary. These decide how much of each charge your plan pays.</AppText>
      </View>
      {notice ? <Notice tone="warning" title={notice} /> : null}
      {failure ? <ErrorNotice error={failure} /> : null}
      <RulesFields rules={rules} categories={categories} showYearStart={needsYear} errors={errors} onChange={setRules} />
    </Screen>
  );
}
