import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ErrorNotice } from '../../components/states';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { space } from '../../theme/tokens';
import { CaseCard } from './case-card';
import { useRefreshOnFocus } from './use-refresh-on-focus';

/** "Activity" (design v3): every case started on this phone for this account; tapping resumes it. */
export function ActivityScreen() {
  const { colors, dark } = useTheme();
  useFocusStatusBar(dark ? 'light' : 'dark');
  const { loaded, items, summaries, refresh } = useRefreshOnFocus();

  return (
    <Screen headerless>
      <AppText variant="title">Activity</AppText>
      {!loaded ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading activity" /> : null}
      {loaded && items.length === 0 ? (
        <Card style={{ gap: space(3) }}>
          <AppText muted>Estimates you start will appear here.</AppText>
          <Button label="Start on Home" variant="secondary" onPress={() => router.navigate('/')} />
        </Card>
      ) : null}
      <View style={{ gap: space(3) }}>
        {items.map((item) => {
          const state = summaries[item.caseId];
          if (!state || state.status === 'loading') {
            return <ActivityIndicator key={item.caseId} color={colors.primary} accessibilityLabel="Loading a case" />;
          }
          if (state.status === 'error') return <ErrorNotice key={item.caseId} error={state.error} onRetry={refresh} />;
          return <CaseCard key={item.caseId} summary={state.summary} />;
        })}
      </View>
    </Screen>
  );
}
