import type { CoverageComparison, DentalCase, EstimateResult, ScenarioComparisonResult } from '@actionbridge/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { AgentOrb } from '../../components/orb';
import { ErrorNotice, ErrorState, LoadingState } from '../../components/states';
import { AppText, Badge, Button, Card, Disclosure, EstimateNote, Notice, Row, Screen, Section } from '../../components/ui';
import { formatCents } from '../../lib/format';
import { questionFor } from '../../lib/questions';
import { useApi } from '../../services/api-context';
import { fonts, space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { isSampleCase } from '../case/facts';
import { useRevisionResult } from '../case/use-revision-result';
import { buildOptions, selfPayView } from './options-model';
import { ScenarioCard } from './scenario-card';

type Results = { estimate: EstimateResult; scenarios: ScenarioComparisonResult; coverage: CoverageComparison };

/**
 * "Your dental options" (design v3). Server-calculated timing options for the current revision,
 * plus the self-pay comparison. Results for an older revision are never shown as current.
 */
export function OptionsScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  const api = useApi();
  const {
    current,
    failure,
    retry: calculate,
  } = useRevisionResult<Results>(caseId, record?.caseRevision, reload, async (id, revision) => {
    const [estimate, scenarios, coverage] = await Promise.all([api.estimate(id, revision), api.scenarios(id, revision), api.coverageComparison(id, revision)]);
    return { estimate, scenarios, coverage };
  });

  if (loading) return <LoadingState label="Loading your details" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading your details" />;

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
  // Hooks stay above every early return (rules of hooks): results can change from loading to estimated.
  const { width } = useWindowDimensions();
  const sample = isSampleCase(record);
  const footer = <Button label="Edit details" variant="secondary" onPress={() => router.dismissTo(`/case/${record.caseId}/facts`)} />;

  if (estimate.status === 'needs_information') {
    return (
      <Screen footer={<Button label="Answer the missing details" onPress={() => router.push(`/case/${record.caseId}/questions`)} />}>
        {sample ? <Badge label="Sample data" tone="neutral" /> : null}
        <AppText variant="title">A few details are missing</AppText>
        <AppText muted>We need these before we can estimate.</AppText>
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

  const sideBySide = width >= 700;
  const model = buildOptions(record, scenarios);
  const notes = [model.outcomeNote, ...scenarios.limitations.map((l) => l.message)].filter((note): note is string => Boolean(note));
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

      {/* Stacked on phones, side by side on tablets (design v3 "Options, tablet"). */}
      <View accessibilityRole="radiogroup" accessibilityLabel="Timing options" style={{ gap: space(3), flexDirection: sideBySide ? 'row' : 'column', alignItems: sideBySide ? 'stretch' : undefined }}>
        {model.cards.map((card) => (
          <View key={card.scenarioId} style={sideBySide ? { flex: 1 } : undefined}>
            <ScenarioCard card={card} selected={card.scenarioId === selected} onSelect={() => setSelected(card.scenarioId)} fill={sideBySide} />
          </View>
        ))}
      </View>

      {model.difference ? (
        <Card tone="highlight">
          <AppText variant="heading">Estimated difference: {formatCents(model.difference.cents)}</AppText>
          <AppText variant="caption">{model.difference.conditions}</AppText>
        </Card>
      ) : null}
      {notes.length > 0 ? <Notice tone="info" title={notes[0] ?? ''} {...(notes.length > 1 ? { body: notes.slice(1).join('\n') } : {})} /> : null}

      <Disclosure title="What could change this estimate">
        {model.benefitsBefore ? (
          <View style={{ gap: space(1), paddingBottom: space(1) }}>
            <AppText variant="label" style={{ fontFamily: fonts.semibold }}>
              Your {model.benefitsBefore.yearLabel} benefits before this treatment
            </AppText>
            <Row label="Plan already paid" value={formatCents(model.benefitsBefore.paidCents)} />
            <Row label={`Left of the ${formatCents(model.benefitsBefore.maximumCents)} annual maximum`} value={formatCents(model.benefitsBefore.leftCents)} />
          </View>
        ) : null}
        {model.whatCouldChange.map((item) => (
          <AppText key={item} variant="caption">
            • {item}
          </AppText>
        ))}
      </Disclosure>

      <SelfPaySection record={record} coverage={coverage} />

      <EstimateNote />
    </Screen>
  );
}

function SelfPaySection({ record, coverage }: { record: DentalCase; coverage: CoverageComparison }) {
  const view = selfPayView(record, coverage);
  const open = () => router.push(`/case/${record.caseId}/self-pay`);
  return (
    <Section title="Self-pay comparison">
      <Card>
        {view.status === 'unavailable' ? (
          <>
            <AppText variant="caption">
              No self-pay quote yet. Add your dentist’s cash price to compare.
            </AppText>
            <Button label="Add a self-pay quote" variant="secondary" onPress={open} />
          </>
        ) : (
          <>
            {view.insuredCents !== null ? <Row label="With insurance" value={formatCents(view.insuredCents)} /> : null}
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
    </Section>
  );
}
