import type { DentalCase, ScenarioComparison } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Checkbox, Notice, Row, Screen } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { newIdempotencyKey } from '../../lib/idempotency';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { space } from '../../theme/tokens';
import { useCase, useSavedStrategy } from '../case/case-store';
import { buildFactGroups, isSampleCase } from '../case/facts';
import { useRevisionResult } from '../case/use-revision-result';
import { buildOptions } from '../options/options-model';
import { findScenario } from '../plan/plan-model';
import { classifySaveFailure } from './save-flow';

/** "Review your plan" (design v3): what is saved, what saving does and doesn't do, explicit consent. */
export function ReviewScreen() {
  const { caseId, scenario: scenarioId } = useLocalSearchParams<{ caseId: string; scenario: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const { current, failure, retry: load } = useRevisionResult(caseId, record?.caseRevision, reload, api.scenarios);

  if (loading) return <LoadingState label="Loading your plan" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your plan" />;
  if (failure) {
    return (
      <Screen>
        <ErrorNotice error={failure} onRetry={load} />
      </Screen>
    );
  }
  if (!current) return <LoadingState label="Loading your plan" />;
  if (current.status !== 'estimated' || !findScenario(current, scenarioId)) return <Stale caseId={record.caseId} />;
  return <ReviewFlow record={record} comparison={current} scenarioId={scenarioId!} />;
}

type Phase = { kind: 'review' } | { kind: 'saving' } | { kind: 'retry'; attempt: number } | { kind: 'stale' } | { kind: 'error'; error: ApiError };

function ReviewFlow({ record, comparison, scenarioId }: { record: DentalCase; comparison: ScenarioComparison; scenarioId: string }) {
  const api = useApi();
  const { putSave } = useSavedStrategy(record.caseId);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const attempts = useRef(0);
  // One key per decision to save; retries of that save reuse it, so the server stores one plan.
  const idempotencyKey = useRef<string | null>(null);

  const card = buildOptions(record, comparison).cards.find((c) => c.scenarioId === scenarioId)!;
  const facts = buildFactGroups(record).flatMap((g) => g.rows);
  const paid = facts.find((row) => row.key.endsWith('.insurerAlreadyPaidCents'));
  const network = record.procedures.map((p) => p.network);
  const basis = [
    { label: 'Coverage', value: facts.find((row) => row.key === 'coverageMode')?.value ?? 'Not answered' },
    { label: 'Treatment', value: record.procedures.map((p) => p.label).join(', ') },
    { label: 'Network', value: network.every((n) => n === 'in') ? 'In network' : network.every((n) => n === 'out') ? 'Out of network' : 'Mixed or not sure' },
    ...(paid ? [{ label: 'Plan already paid this year', value: paid.value }] : []),
  ];

  const save = async () => {
    if (!consent || phase.kind === 'saving') return;
    idempotencyKey.current ??= newIdempotencyKey();
    attempts.current += 1;
    setPhase({ kind: 'saving' });
    AccessibilityInfo.announceForAccessibility('Saving your plan');
    try {
      const response = await api.saveStrategy(record.caseId, { scenarioId, expectedRevision: record.caseRevision, consent: true }, idempotencyKey.current);
      putSave(record.caseId, response);
      router.replace(`/case/${record.caseId}/saved`);
    } catch (caught) {
      const apiError = asApiError(caught);
      const kind = classifySaveFailure(apiError);
      // `expired` is handled by the API provider (signs out to Welcome with the expired note).
      if (kind === 'retry') setPhase({ kind: 'retry', attempt: attempts.current });
      else if (kind === 'stale') setPhase({ kind: 'stale' });
      else if (kind === 'error') setPhase({ kind: 'error', error: apiError });
    }
  };

  if (phase.kind === 'saving') {
    return (
      <ThemeProvider scheme="dark">
        <Screen scroll={false}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(5) }} accessibilityLiveRegion="polite">
            <AgentOrb size={150} mode="active" />
            <AppText variant="title">Saving your plan</AppText>
            <AppText muted>This takes a moment.</AppText>
          </View>
        </Screen>
      </ThemeProvider>
    );
  }

  if (phase.kind === 'retry') {
    return (
      <Recovery
        title="We couldn’t confirm your plan was saved"
        body="The connection dropped before we heard back. Your choice and answers are still here."
        note={`Attempt ${phase.attempt} didn’t finish. Trying again uses the same request, so you won’t end up with two copies.`}
        primary={{ label: 'Try again', onPress: save }}
        secondary={{ label: 'Review details', onPress: () => setPhase({ kind: 'review' }) }}
        tertiary={{ label: 'Back to plan', onPress: () => router.back() }}
      />
    );
  }

  if (phase.kind === 'stale') return <Stale caseId={record.caseId} />;

  return (
    <Screen
      footer={
        <>
          {consent ? null : (
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>
              Tick the box above to save.
            </AppText>
          )}
          <Button label="Save this plan" onPress={save} disabled={!consent} />
        </>
      }
    >
      {isSampleCase(record) ? <Badge label="Sample data" tone="neutral" /> : null}
      <View style={{ gap: space(2) }}>
        <AppText muted>Saving keeps this comparison so you can come back to it.</AppText>
      </View>
      {phase.kind === 'error' ? <ErrorNotice error={phase.error} /> : null}

      <Card tone="highlight">
        <AppText variant="caption" muted>
          Your choice · estimated
        </AppText>
        <AppText variant="heading">{card.title}</AppText>
        <AppText variant="caption" muted>
          {card.timing}
        </AppText>
        <Row label="You pay · estimated" value={formatCents(card.youPayCents)} strong />
        <Row label="Plan pays · estimated" value={formatCents(card.planPaysCents)} />
      </Card>

      <Card>
        <AppText variant="heading">Based on</AppText>
        {basis.map((item) => (
          <Row key={item.label} label={item.label} value={item.value} />
        ))}
        <Button label="Change details" variant="secondary" onPress={() => router.dismissTo(`/case/${record.caseId}/facts`)} />
      </Card>

      <Card>
        <AppText variant="heading">Saving this plan will</AppText>
        <Point ok text="Keep this comparison and your answers in your account" />
        <AppText variant="heading" style={{ marginTop: space(2) }}>
          Saving won’t
        </AppText>
        <Point text="Book any appointment" />
        <Point text="Send anything to your dentist or insurer" />
        <Point text="Submit a claim or use any of your benefits" />
      </Card>

      <Checkbox boxed label="Store this plan and my answers in my account." checked={consent} onChange={setConsent} />
    </Screen>
  );
}

function Point({ text, ok = false }: { text: string; ok?: boolean }) {
  const { colors } = useTheme();
  const Icon = ok ? Check : X;
  return (
    <View style={{ flexDirection: 'row', gap: space(2.5), alignItems: 'flex-start' }}>
      <Icon size={18} color={ok ? colors.primary : colors.textMuted} style={{ marginTop: 2 }} />
      <AppText variant="caption" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

type Action = { label: string; onPress: () => void };

/** Recovery (design v3, dark with the amber orb): what happened, what is safe, what to do next. */
export function Recovery({ title, body, note, primary, secondary, tertiary }: { title: string; body: string; note: string; primary: Action; secondary?: Action; tertiary?: Action }) {
  return (
    <ThemeProvider scheme="dark">
      <Screen
        footer={
          <>
            <Button label={primary.label} onPress={primary.onPress} />
            {secondary ? <Button label={secondary.label} variant="secondary" onPress={secondary.onPress} /> : null}
            {tertiary ? <Button label={tertiary.label} variant="ghost" onPress={tertiary.onPress} /> : null}
          </>
        }
      >
        <View style={{ alignItems: 'center', paddingTop: space(6) }}>
          <AgentOrb size={140} mode="alert" />
        </View>
        <View accessibilityRole="alert" style={{ gap: space(2) }}>
          <AppText variant="title">{title}</AppText>
          <AppText muted>{body}</AppText>
        </View>
        <Notice tone="neutral" title={note} />
      </Screen>
    </ThemeProvider>
  );
}

function Stale({ caseId }: { caseId: string }) {
  return (
    <Recovery
      title="This estimate may be out of date"
      body="Your details changed after this option was calculated. See the current options before saving."
      note="Nothing was saved."
      primary={{ label: 'See current options', onPress: () => router.dismissTo(`/case/${caseId}/options`) }}
    />
  );
}
