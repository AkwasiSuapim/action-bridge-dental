import type { EstimateResult, ScenarioComparisonResult } from '@actionbridge/contracts';
import { useState } from 'react';
import { AppText, Badge, Button, Card, Gap, Notice, Row, Screen } from '../../components/ui';
import { useAuth } from '../auth/auth-context';
import { sampleCaseRequest } from '../intake/sample-case';
import { formatCents } from '../../lib/format';
import { ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';

/**
 * Live sample check: proves the signed-in phone → live AWS API → engine path with the synthetic
 * fixture. Temporary destination of Home's "Try a sample" until the facts review screen lands.
 */
export function SampleCheckScreen() {
  const auth = useAuth();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ caseId: string; estimate: EstimateResult; scenarios: ScenarioComparisonResult } | null>(null);

  const runSample = async () => {
    setBusy(true);
    setError(null);
    try {
      const { caseId, caseRevision } = await api.createCase(sampleCaseRequest());
      const [estimate, scenarios] = await Promise.all([api.estimate(caseId, caseRevision), api.scenarios(caseId, caseRevision)]);
      setResult({ caseId, estimate, scenarios });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('INTERNAL', 'Something went wrong. Try again.'));
      if (caught instanceof ApiError && caught.code === 'UNAUTHENTICATED') await auth.signOut('expired');
    } finally {
      setBusy(false);
    }
  };

  const alternative = result?.scenarios.status === 'estimated' ? result.scenarios.alternatives[0] : undefined;

  return (
    <Screen>
      <Card>
        <Badge label="Synthetic sample" tone="info" />
        <AppText variant="heading">Live connection check</AppText>
        <AppText variant="caption" muted>
          Sends the fictional two-fillings-and-a-crown case to the live API and shows the amounts the server calculates.
        </AppText>
        <Button label={result ? 'Run again' : 'Run the sample'} onPress={runSample} loading={busy} />
      </Card>

      {error ? (
        <Notice tone="danger" title={error.message} body={error.options.requestId ? `Reference: ${error.options.requestId}` : undefined} />
      ) : null}

      {result?.estimate.status === 'estimated' ? (
        <Card>
          <Badge label={`Estimate · revision ${result.estimate.caseRevision}`} tone="success" />
          <AppText variant="label" muted>
            All treatment this benefit year
          </AppText>
          <AppText variant="money">{formatCents(result.estimate.totals.patientPaysCents)}</AppText>
          <Row label="Plan pays (estimated)" value={formatCents(result.estimate.totals.insurerPaysCents)} />
          <Row label="Dentist’s total charge" value={formatCents(result.estimate.totals.providerChargeCents)} muted />
          {alternative ? (
            <>
              <Gap size={2} />
              <AppText variant="label" muted>
                Permitted alternative: {alternative.movedProcedureIds.join(', ')} after the benefit-year reset
              </AppText>
              <Row label="You pay (estimated)" value={formatCents(alternative.estimate.totals.patientPaysCents)} strong />
              <Row label="Estimated difference" value={formatCents(alternative.differenceFromBaselineCents)} />
              {alternative.conditional ? <Badge label="Conditional: assumes next year’s coverage is unchanged" tone="warning" /> : null}
            </>
          ) : null}
          <AppText variant="caption" muted>
            Engine {result.estimate.engineVersion} · case {result.caseId.slice(0, 8)}
          </AppText>
        </Card>
      ) : null}
    </Screen>
  );
}
