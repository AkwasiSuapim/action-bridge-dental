import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorState, LoadingState } from '../../components/states';
import { AppText, Card, Row, Screen } from '../../components/ui';
import { space } from '../../theme/tokens';
import { useCase } from '../case/case-store';
import { buildSources } from './sources';

export function SourcesScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { record, loading, error, reload } = useCase(caseId);
  if (loading) return <LoadingState label="Loading sources" />;
  if (!record) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading sources" />;
  const sources = buildSources(record);

  return (
    <Screen>
      <AppText muted>What we used, and where each detail came from. Nothing here is confirmed by your insurer.</AppText>
      {sources.documents.length > 0 ? (
        <Group title="From your documents">
          {sources.documents.map((item) => (
            <Row key={item.label} label={item.label} value={item.value} />
          ))}
        </Group>
      ) : null}
      {sources.answers.length > 0 ? (
        <Group title="Provided by you">
          {sources.answers.map((item) => (
            <Row key={item.label} label={item.label} value={item.value} />
          ))}
        </Group>
      ) : null}
      {sources.sample ? (
        <Group title="Sample data">
          <AppText variant="caption">The treatment, plan rules and balances are a fictional sample, not real plan terms or prices.</AppText>
        </Group>
      ) : null}
      <Group title="Assumed for comparison">
        {sources.assumed.map((text) => (
          <AppText key={text} variant="caption">
            • {text}
          </AppText>
        ))}
      </Group>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <AppText variant="heading">{title}</AppText>
      <Card>{children}</Card>
    </View>
  );
}
