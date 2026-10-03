import type { EstimateResult, ScenarioComparisonResult } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Gap, Notice, Row, Screen } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { questionFor } from '../../lib/questions';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { fonts, space } from '../../theme/tokens';
import { useCase } from './case-store';
import { isSampleCase } from './facts';

type Calculation = { revision: number; estimate: EstimateResult; scenarios: ScenarioComparisonResult };

/**
 * Interim results: the server-calculated estimate and timing comparison for the case's current
 * revision. Every amount comes from the API; nothing is computed or rounded here.
 */
export function ResultsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const revision = record?.caseRevision;
  const calculate = useCallback(async () => {
    if (!caseId || revision === undefined) return;
    setBusy(true);
    setFailure(null);
    try {
      const [estimate, scenarios] = await Promise.all([api.estimate(caseId, revision), api.scenarios(caseId, revision)]);
      setCalc({ revision, estimate, scenarios });
    } catch (caught) {
      const apiError = asApiError(caught);
      // A newer revision exists: reload it, and the effect below recalculates for it.
      if (apiError.code === 'REVISION_CONFLICT') await reload();
      else setFailure(apiError);
    } finally {
      setBusy(false);
    }
  }, [api, caseId, revision, reload]);

  useEffect(() => {
    void calculate();
  }, [calculate]);

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;

  // Results for an older revision are never shown as current.
  const current = calc && calc.revision === record.caseRevision ? calc : null;

  if (!current) {
    return (
      <Screen>
        {failure ? (
          <ErrorNotice error={failure} onRetry={calculate} />
        ) : (
          <View style={{ alignItems: 'center', gap: space(4), paddingVertical: space(10) }} accessible accessibilityLabel="Calculating estimated costs">
            <AgentOrb size={120} mode={busy ? 'active' : 'idle'} />
            <AppText muted>Calculating estimated costs…</AppText>
          </View>
        )}
      </Screen>
    );
  }

  const { estimate, scenarios } = current;
  const comparison = scenarios.status === 'estimated' ? scenarios : null;
  const alternative = comparison?.alternatives[0];

  return (
    <Screen footer={<Button label="Edit details" variant="secondary" onPress={() => router.back()} />}>
      {isSampleCase(record) ? <Badge label="Sample data" tone="neutral" /> : null}

      {estimate.status === 'needs_information' ? (
        <>
          <AppText variant="title">A few details are missing</AppText>
          <AppText muted>We can’t give an estimate without these. Answer what you can — “I don’t know” is fine.</AppText>
          <Card style={{ gap: space(4) }}>
            {estimate.missing.map((fact) => {
              const question = questionFor(fact, record);
              return (
                <View key={fact.fieldPath} style={{ gap: space(2) }}>
                  <AppText style={{ fontFamily: fonts.semibold }}>{question.label}</AppText>
                  <AppText variant="caption" muted>
                    {question.reason}
                  </AppText>
                  {question.kind === 'edit_case' ? null : (
                    <Button
                      label="Answer"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/case/[caseId]/edit', params: { caseId: record.caseId, field: fact.fieldPath } })}
                    />
                  )}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {estimate.status === 'unsupported' ? (
        <>
          <AppText variant="title">We can’t estimate this plan yet</AppText>
          <Notice tone="warning" title="Some plan rules aren’t supported" body={estimate.limitations.map((l) => l.message).join('\n')} />
        </>
      ) : null}

      {estimate.status === 'estimated' ? (
        <>
          <AppText variant="title">Your estimate</AppText>
          <Card>
            <Badge label={estimate.conditional ? 'Estimate · conditional' : 'Estimate'} tone={estimate.conditional ? 'warning' : 'success'} />
            <AppText variant="label" muted>
              All treatment on the planned dates
            </AppText>
            <AppText variant="money">{formatCents(estimate.totals.patientPaysCents)}</AppText>
            <Row label="Plan pays (estimated)" value={formatCents(estimate.totals.insurerPaysCents)} />
            <Row label="Dentist’s total charge" value={formatCents(estimate.totals.providerChargeCents)} muted />
            {alternative ? (
              <>
                <Gap size={2} />
                <AppText variant="label" muted>
                  Permitted alternative: {alternative.movedProcedureIds.map((id) => record.procedures.find((p) => p.id === id)?.label ?? id).join(', ')} after the benefit-year reset
                </AppText>
                <Row label="You pay (estimated)" value={formatCents(alternative.estimate.totals.patientPaysCents)} strong />
                <Row label="Estimated difference" value={formatCents(alternative.differenceFromBaselineCents)} />
                {alternative.conditional ? <Badge label="Conditional: assumes next year’s coverage is unchanged" tone="warning" /> : null}
              </>
            ) : comparison ? (
              <AppText variant="caption" muted>
                {comparison.outcome === 'no_flexible_timing'
                  ? 'No other dates were compared: your dentist hasn’t given a flexible window.'
                  : comparison.outcome === 'no_lower_cost_alternative'
                    ? 'No permitted timing option has a lower estimated cost.'
                    : 'A later-date option couldn’t be compared. See the limitations below.'}
              </AppText>
            ) : null}
          </Card>
          {comparison && comparison.limitations.length > 0 ? (
            <Notice tone="info" title="Limits of this comparison" body={comparison.limitations.map((l) => l.message).join('\n')} />
          ) : null}
          <AppText variant="caption" muted>
            Estimates only. Your dentist and insurer decide final costs. Engine {estimate.engineVersion} · revision {estimate.caseRevision}
          </AppText>
        </>
      ) : null}
    </Screen>
  );
}
