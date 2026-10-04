import type { DentalCase, ScenarioComparisonResult } from '@actionbridge/contracts';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, FileSearch, Share2 } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, Share, View } from 'react-native';
import { FactBadge } from '../../components/fact-badge';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Notice, Row, Screen } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { isSampleCase } from '../case/facts';
import { BenefitBar } from './benefit-bar';
import { buildPlanDetails, findScenario, type BreakdownItem, type PlanDetails } from './plan-model';

/** "Plan details" (design v3): the selected option explained, with sources and questions to ask. */
export function PlanScreen() {
  const { caseId, scenario: scenarioId } = useLocalSearchParams<{ caseId: string; scenario: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const [result, setResult] = useState<{ revision: number; scenarios: ScenarioComparisonResult } | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const revision = record?.caseRevision;
  const load = useCallback(async () => {
    if (!caseId || revision === undefined) return;
    setFailure(null);
    try {
      setResult({ revision, scenarios: await api.scenarios(caseId, revision) });
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') await reload();
      else setFailure(apiError);
    }
  }, [api, caseId, revision, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading your plan" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your plan" />;
  if (failure) {
    return (
      <Screen>
        <ErrorNotice error={failure} onRetry={load} />
      </Screen>
    );
  }
  const current = result && result.revision === record.caseRevision ? result.scenarios : null;
  if (!current) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space(4), paddingVertical: space(10) }} accessible accessibilityLabel="Loading your plan">
          <AgentOrb size={110} mode="active" />
        </View>
      </Screen>
    );
  }

  const scenario = current.status === 'estimated' ? findScenario(current, scenarioId) : null;
  if (current.status !== 'estimated' || !scenario) {
    // The option was calculated for an older revision of the case: never show it as current.
    return (
      <Screen footer={<Button label="See current options" onPress={() => router.dismissTo(`/case/${record.caseId}/options`)} />}>
        <AppText variant="title">This estimate may be out of date</AppText>
        <Notice tone="warning" title="Your details changed after this option was calculated. See the current options to continue." />
      </Screen>
    );
  }
  return <PlanBody record={record} plan={buildPlanDetails(record, current, scenario)} />;
}

function PlanBody({ record, plan }: { record: DentalCase; plan: PlanDetails }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(plan.shareText);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility('Questions copied');
  };

  return (
    <Screen
      footer={
        <Button
          label="Review and save"
          onPress={() => router.push({ pathname: '/case/[caseId]/review', params: { caseId: record.caseId, scenario: plan.scenarioId } })}
        />
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        <Badge label="Your selected option · estimated" tone="neutral" />
        {isSampleCase(record) ? <Badge label="Sample data" tone="neutral" /> : null}
      </View>

      <Card>
        <AppText variant="title">{plan.title}</AppText>
        <AppText variant="caption" muted>
          {plan.timing}
        </AppText>
        <Row label="You pay · estimated" value={formatCents(plan.youPayCents)} strong />
        <Row label="Plan pays · estimated" value={formatCents(plan.planPaysCents)} />
        {plan.comparedToBaseline ? <AppText variant="caption">{plan.comparedToBaseline}</AppText> : null}
        <Button label="Compare options" variant="secondary" onPress={() => router.back()} />
      </Card>

      <Section title="What needs confirmation">
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {plan.confirmations.map((item, index) => (
            <View key={item.text} style={{ padding: space(4), gap: space(1.5), borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}>
              <AppText style={{ fontFamily: fonts.semibold }}>{item.text}</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap' }}>
                <AppText variant="caption" muted>
                  {item.ask}
                </AppText>
                <FactBadge source={item.source} />
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Treatment timeline">
        <Card>
          {plan.timeline.map((entry) =>
            entry.kind === 'divider' ? (
              <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <AppText variant="caption" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
                  {entry.text}
                </AppText>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </View>
            ) : (
              <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }} accessible accessibilityLabel={`${entry.day}, ${entry.year}: ${entry.title}. You pay ${formatCents(entry.youPayCents)}.`}>
                <View style={{ width: 64 }}>
                  <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
                    {entry.day}
                  </AppText>
                  <AppText variant="caption" muted>
                    {entry.year}
                  </AppText>
                </View>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                <AppText style={{ flex: 1 }}>{entry.title}</AppText>
                <AppText variant="label">You pay {formatCents(entry.youPayCents)}</AppText>
              </View>
            ),
          )}
        </Card>
      </Section>

      <Section title="Cost breakdown">
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {plan.items.map((item, index) => (
            <BreakdownRow key={item.procedureId} item={item} first={index === 0} />
          ))}
          <View style={{ padding: space(4), gap: space(1), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceMuted }}>
            <Row label="Total · you pay · estimated" value={formatCents(plan.youPayCents)} strong />
            <Row label="Total · plan pays · estimated" value={formatCents(plan.planPaysCents)} />
          </View>
        </Card>
      </Section>

      <Section title="Benefits by year">
        <AppText variant="caption" muted>
          Each benefit year has its own maximum. We never add the years together.
        </AppText>
        <Card style={{ gap: space(6) }}>
          {plan.bars.map((bar) => (
            <BenefitBar key={bar.planYearId} bar={bar} />
          ))}
        </Card>
      </Section>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/case/${record.caseId}/sources`)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(3),
          padding: space(4),
          borderRadius: layout.radius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <FileSearch size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: space(0.5) }}>
          <AppText style={{ fontFamily: fonts.semibold }}>Where these numbers come from</AppText>
          <AppText variant="caption" muted>
            Your answers, sample data and what we assumed
          </AppText>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>

      <Section title="Next step: questions to ask">
        <Card>
          <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
            Your dentist
          </AppText>
          {plan.questions.dentist.map((q) => (
            <AppText key={q} variant="caption">
              • {q}
            </AppText>
          ))}
          <AppText variant="label" style={{ fontFamily: fonts.semibold, marginTop: space(2) }}>
            Your insurer
          </AppText>
          {plan.questions.insurer.map((q) => (
            <AppText key={q} variant="caption">
              • {q}
            </AppText>
          ))}
          <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(2) }}>
            <View style={{ flex: 1 }}>
              <Button label={copied ? 'Copied' : 'Copy'} variant="secondary" icon={copied ? <Check size={18} color={colors.primary} /> : <Copy size={18} color={colors.primary} />} onPress={copy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Share" variant="secondary" icon={<Share2 size={18} color={colors.primary} />} onPress={() => void Share.share({ message: plan.shareText })} />
            </View>
          </View>
          <AppText variant="caption" muted>
            Only these questions are shared — no amounts or documents. Nothing is sent unless you choose to share it.
          </AppText>
        </Card>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2.5) }}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

function BreakdownRow({ item, first }: { item: BreakdownItem; first: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${item.title}, ${item.date}. You pay ${formatCents(item.youPayCents)}, estimated.`}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space(2.5), paddingHorizontal: space(4), paddingVertical: space(3) }}
      >
        <View style={{ flex: 1, gap: space(0.5) }}>
          <AppText style={{ fontFamily: fonts.bold }}>{item.title}</AppText>
          <AppText variant="caption" muted>
            {item.date}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="caption" muted>
            You pay · est.
          </AppText>
          <AppText style={{ fontFamily: fonts.semibold }}>{formatCents(item.youPayCents)}</AppText>
        </View>
        <Icon size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space(4), paddingBottom: space(4), gap: space(1.5) }}>
          {item.rows.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} strong={row.strong ?? false} />
          ))}
          {item.note ? <Notice tone="info" title={item.note} /> : null}
        </View>
      ) : null}
    </View>
  );
}
