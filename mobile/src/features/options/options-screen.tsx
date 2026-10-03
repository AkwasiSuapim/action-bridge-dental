import type { CoverageComparison, DentalCase, EstimateResult, ScenarioComparisonResult } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Notice, Row, Screen } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { questionFor } from '../../lib/questions';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { isSampleCase } from '../case/facts';
import { buildOptions, selfPayView } from './options-model';
import { ScenarioCard } from './scenario-card';

type Results = { revision: number; estimate: EstimateResult; scenarios: ScenarioComparisonResult; coverage: CoverageComparison };

/**
 * "Your dental options" (design v3). Server-calculated timing options for the current revision,
 * plus the self-pay comparison. Results for an older revision are never shown as current.
 */
export function OptionsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const [results, setResults] = useState<Results | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const revision = record?.caseRevision;
  const calculate = useCallback(async () => {
    if (!caseId || revision === undefined) return;
    setFailure(null);
    try {
      const [estimate, scenarios, coverage] = await Promise.all([
        api.estimate(caseId, revision),
        api.scenarios(caseId, revision),
        api.coverageComparison(caseId, revision),
      ]);
      setResults({ revision, estimate, scenarios, coverage });
    } catch (caught) {
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') await reload();
      else setFailure(apiError);
    }
  }, [api, caseId, revision, reload]);

  useEffect(() => {
    void calculate();
  }, [calculate]);

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;

  const current = results && results.revision === record.caseRevision ? results : null;
  if (!current) {
    return (
      <Screen>
        {failure ? (
          <ErrorNotice error={failure} onRetry={calculate} />
        ) : (
          <View style={{ alignItems: 'center', gap: space(4), paddingVertical: space(10) }} accessible accessibilityLabel="Calculating estimated costs">
            <AgentOrb size={120} mode="active" />
            <AppText muted>Calculating estimated costs…</AppText>
          </View>
        )}
      </Screen>
    );
  }
  return <OptionsBody record={record} results={current} />;
}

function OptionsBody({ record, results }: { record: DentalCase; results: Results }) {
  const { estimate, scenarios, coverage } = results;
  const [selected, setSelected] = useState(scenarios.status === 'estimated' ? scenarios.baseline.scenarioId : null);
  const sample = isSampleCase(record);
  const footer = <Button label="Edit details" variant="secondary" onPress={() => router.dismissTo(`/case/${record.caseId}/facts`)} />;

  if (estimate.status === 'needs_information') {
    return (
      <Screen footer={<Button label="Answer the missing details" onPress={() => router.push(`/case/${record.caseId}/questions`)} />}>
        {sample ? <Badge label="Sample data" tone="neutral" /> : null}
        <AppText variant="title">A few details are missing</AppText>
        <AppText muted>We need these before we can estimate. “I don’t know” is a fine answer — we’ll show what’s still open.</AppText>
        <Card>
          {estimate.missing.map((fact) => (
            <AppText key={fact.fieldPath}>• {questionFor(fact, record).label}</AppText>
          ))}
        </Card>
        <SelfPaySection record={record} coverage={coverage} />
      </Screen>
    );
  }

  if (estimate.status === 'unsupported' || scenarios.status !== 'estimated') {
    const limitations = estimate.status === 'unsupported' ? estimate.limitations : scenarios.status === 'unsupported' ? scenarios.limitations : [];
    const notInsured = limitations.some((l) => l.code === 'NOT_INSURED');
    return (
      <Screen footer={footer}>
        {sample ? <Badge label="Sample data" tone="neutral" /> : null}
        <AppText variant="title">{notInsured ? 'Your self-pay estimate' : 'We can’t estimate this plan yet'}</AppText>
        {notInsured ? null : <Notice tone="warning" title="Some plan rules aren’t supported" body={limitations.map((l) => l.message).join('\n')} />}
        <SelfPaySection record={record} coverage={coverage} />
      </Screen>
    );
  }

  const model = buildOptions(record, scenarios);
  const selectedCard = model.cards.find((card) => card.scenarioId === selected);
  return (
    <Screen
      footer={
        <>
          <Button
            label="Review this plan"
            onPress={() => selected && router.push({ pathname: '/case/[caseId]/plan', params: { caseId: record.caseId, scenario: selected } })}
          />
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            Shows the math and sources for {selectedCard ? selectedCard.title.toLowerCase() : 'this option'}. Nothing is saved yet.
          </AppText>
        </>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        <Badge label="Estimated" tone="neutral" />
        {sample ? <Badge label="Sample data" tone="neutral" /> : null}
      </View>
      <View style={{ gap: space(2) }}>
        <AppText variant="title">Your dental options</AppText>
        <AppText muted>{model.summary}</AppText>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Timing options" style={{ gap: space(3) }}>
        {model.cards.map((card) => (
          <ScenarioCard key={card.scenarioId} card={card} selected={card.scenarioId === selected} onSelect={() => setSelected(card.scenarioId)} />
        ))}
      </View>

      {model.difference ? (
        <Card tone="highlight">
          <AppText variant="heading">Estimated difference: {formatCents(model.difference.cents)}</AppText>
          <AppText variant="caption">{model.difference.conditions}</AppText>
        </Card>
      ) : null}
      {model.outcomeNote ? <Notice tone="info" title={model.outcomeNote} /> : null}
      {scenarios.limitations.length > 0 ? <Notice tone="info" title="Limits of this comparison" body={scenarios.limitations.map((l) => l.message).join('\n')} /> : null}

      {model.benefitsBefore ? (
        <Card tone="muted">
          <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
            Your {model.benefitsBefore.yearLabel} benefits before this treatment
          </AppText>
          <Row label="Plan already paid" value={formatCents(model.benefitsBefore.paidCents)} />
          <Row label={`Left of the ${formatCents(model.benefitsBefore.maximumCents)} annual maximum`} value={formatCents(model.benefitsBefore.leftCents)} />
        </Card>
      ) : null}

      <Disclosure title="What could change this estimate">
        {model.whatCouldChange.map((item) => (
          <AppText key={item} variant="caption">
            • {item}
          </AppText>
        ))}
      </Disclosure>

      <SelfPaySection record={record} coverage={coverage} />

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Estimates only. Your dentist and insurer decide final costs.
      </AppText>
    </Screen>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: layout.minHitArea, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}
      >
        <AppText variant="label" style={{ fontFamily: fonts.semibold, flex: 1 }}>
          {title}
        </AppText>
        <Icon size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={{ gap: space(2) }}>{children}</View> : null}
    </Card>
  );
}

function SelfPaySection({ record, coverage }: { record: DentalCase; coverage: CoverageComparison }) {
  const view = selfPayView(record, coverage);
  const open = () => router.push(`/case/${record.caseId}/self-pay`);
  return (
    <View style={{ gap: space(2) }}>
      <AppText variant="heading">Self-pay comparison</AppText>
      <Card>
        {view.status === 'unavailable' ? (
          <>
            <AppText variant="caption">
              No self-pay quote yet. If your dentist offers cash prices, add them to compare with using your insurance.
            </AppText>
            <Button label="Add a self-pay quote" variant="secondary" onPress={open} />
          </>
        ) : (
          <>
            {view.insuredCents !== null ? <Row label="With insurance · estimated" value={formatCents(view.insuredCents)} /> : null}
            <Row label="Self-pay quotes · provided by you" value={formatCents(view.selfPayCents)} />
            <AppText style={{ fontFamily: fonts.semibold }}>{view.result}</AppText>
            {view.notes.map((note) => (
              <AppText key={note} variant="caption" muted>
                {note}
              </AppText>
            ))}
            <Button label="Edit quotes" variant="secondary" onPress={open} />
          </>
        )}
      </Card>
    </View>
  );
}
