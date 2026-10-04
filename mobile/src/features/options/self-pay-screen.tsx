import type { DentalCase } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Button, Notice, Screen, TextField } from '../../components/ui';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { layout, space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { localToday, quoteTexts, selfPayChanges } from './self-pay';

/** Add or edit the dentist's written cash prices (design v3 "Add a self-pay quote"). */
export function SelfPayScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  if (loading) return <LoadingState label="Loading your treatment" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your treatment" />;
  return <SelfPayForm record={record} reload={reload} />;
}

function SelfPayForm({ record, reload }: { record: DentalCase; reload: () => Promise<unknown> }) {
  const api = useApi();
  const { colors } = useTheme();
  const [texts, setTexts] = useState(() => quoteTexts(record));
  const [scopeConfirmed, setScopeConfirmed] = useState(record.procedures.some((p) => p.selfPayQuote));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const result = selfPayChanges(record, texts, scopeConfirmed, localToday(new Date()));
    if ('errors' in result) {
      setErrors(result.errors);
      AccessibilityInfo.announceForAccessibility('Some details need fixing.');
      return;
    }
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      await api.patchCase(record.caseId, { expectedRevision: record.caseRevision, changes: result.changes });
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
    <Screen footer={<Button label="Save quotes" onPress={save} loading={busy} />}>
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Self-pay quotes</AppText>
        <AppText muted>Use the written cash price from your dentist’s office.</AppText>
      </View>
      {notice ? <Notice tone="warning" title={notice} /> : null}
      {failure ? <ErrorNotice error={failure} /> : null}

      {record.procedures.map((procedure) => (
        <TextField
          key={procedure.id}
          label={`${procedure.label} · cash price`}
          value={texts[procedure.id] ?? ''}
          onChangeText={(text) => setTexts((current) => ({ ...current, [procedure.id]: text }))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors[procedure.id] ?? null}
        />
      ))}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: scopeConfirmed }}
        onPress={() => setScopeConfirmed((value) => !value)}
        style={{ flexDirection: 'row', gap: space(3), alignItems: 'center', minHeight: layout.minHitArea }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: scopeConfirmed ? colors.primary : 'transparent' }} />
        <AppText variant="caption" style={{ flex: 1 }}>
          Each quote covers the same service as the treatment estimate.
        </AppText>
      </Pressable>
      {errors.scope ? <Notice tone="danger" title={errors.scope} /> : null}
    </Screen>
  );
}
