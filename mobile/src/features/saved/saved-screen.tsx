import type { LedgerEvent } from '@actionbridge/contracts';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Notice, Screen } from '../../components/ui';
import { formatCents, formatDateTime } from '../../lib/format';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { fonts, space } from '../../theme/tokens';
import { useCase, useSavedStrategy } from '../case/case-store';
import { isSampleCase } from '../case/facts';
import { scenarioTitle } from '../options/options-model';
import { ledgerView } from './ledger';
import { nextStepFor } from './saved-model';
import { BenefitsLeft } from '../options/benefits-left';

/** "Your plan is saved" (design v3, dark): the saved choice, one next step and the real plan history. */
export function SavedScreen() {
  useFocusStatusBar('light');
  return (
    <ThemeProvider scheme="dark">
      <SavedBody />
    </ThemeProvider>
  );
}

function SavedBody() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const { save } = useSavedStrategy(caseId);
  const api = useApi();
  const { colors } = useTheme();
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [ledgerError, setLedgerError] = useState<ApiError | null>(null);
  const [showRoutine, setShowRoutine] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadLedger = useCallback(async () => {
    if (!caseId) return;
    setLedgerError(null);
    try {
      setEvents((await api.ledger(caseId)).events);
    } catch (caught) {
      setLedgerError(asApiError(caught));
    }
  }, [api, caseId]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  if (loading) return <LoadingState label="Loading your saved plan" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your saved plan" />;

  const strategy = save?.strategy ?? null;
  const scenario = strategy?.scenario ?? null;
  const title = scenario ? scenarioTitle(scenario) : 'Your plan';
  const next = scenario ? nextStepFor(record, scenario) : null;
  const history = events ? ledgerView(events, showRoutine) : null;

  const copyQuestion = async () => {
    if (!next) return;
    await Clipboard.setStringAsync(next.question);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility('Question copied');
  };

  return (
    <Screen
      headerless
      footer={
        <>
          {scenario ? (
            <Button label="View plan" onPress={() => router.push({ pathname: '/case/[caseId]/plan', params: { caseId: record.caseId, scenario: scenario.scenarioId } })} />
          ) : null}
          <Button label="Back to Home" variant={scenario ? 'ghost' : 'primary'} onPress={() => router.dismissTo('/')} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: space(3), paddingTop: space(4) }}>
        <AgentOrb size={120} mode="success" />
        <AppText variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          Your plan is saved
        </AppText>
        {scenario ? (
          <AppText muted style={{ textAlign: 'center' }}>
            {title} · You pay {formatCents(scenario.estimate.totals.patientPaysCents)} (estimated)
          </AppText>
        ) : null}
        {strategy ? (
          <AppText variant="caption" muted>
            Saved {formatDateTime(strategy.savedAt)}
          </AppText>
        ) : null}
        {isSampleCase(record) ? <Badge label="Sample data" tone="neutral" /> : null}
      </View>

      {save?.replayed ? <Notice tone="info" title="This plan was already saved. Nothing was duplicated." /> : null}

      {scenario ? <BenefitsLeft scenario={scenario} record={record} /> : null}

      {next ? (
        <Card>
          <AppText variant="caption" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
            Next step
          </AppText>
          <AppText variant="heading">{next.title}</AppText>
          <AppText variant="caption">Ask: “{next.question}”</AppText>
          <Button
            label={copied ? 'Copied' : 'Copy question'}
            variant="secondary"
            icon={copied ? <Check size={18} color={colors.primary} /> : <Copy size={18} color={colors.primary} />}
            onPress={copyQuestion}
          />
        </Card>
      ) : null}

      <View style={{ gap: space(2) }}>
        <AppText variant="heading">Plan history</AppText>
        {ledgerError ? <ErrorNotice error={ledgerError} onRetry={loadLedger} /> : null}
        {history ? (
          <Card>
            {history.entries.map((entry) => (
              <View key={entry.eventId} style={{ gap: space(0.5) }} accessible accessibilityLabel={`${formatDateTime(entry.at)}: ${entry.text}`}>
                <AppText variant="caption" muted>
                  {formatDateTime(entry.at)} · You
                </AppText>
                <AppText>{entry.text}</AppText>
              </View>
            ))}
            {history.hiddenRoutine > 0 || showRoutine ? (
              <Button
                label={showRoutine ? 'Hide routine entries' : `Show ${history.hiddenRoutine} routine ${history.hiddenRoutine === 1 ? 'entry' : 'entries'}`}
                variant="ghost"
                onPress={() => setShowRoutine((value) => !value)}
              />
            ) : null}
          </Card>
        ) : ledgerError ? null : (
          <AppText variant="caption" muted>
            Loading history…
          </AppText>
        )}
      </View>

    </Screen>
  );
}
