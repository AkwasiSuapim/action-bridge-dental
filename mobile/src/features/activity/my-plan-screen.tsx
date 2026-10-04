import { router } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';
import { ErrorNotice } from '../../components/states';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { space } from '../../theme/tokens';
import { CaseCard } from './case-card';
import { useRefreshOnFocus } from './use-refresh-on-focus';

/** "My plan" (design v3): the most recent case and where to pick it up. */
export function MyPlanScreen() {
  const { colors, dark } = useTheme();
  useFocusStatusBar(dark ? 'light' : 'dark');
  const { loaded, items, summaries, refresh } = useRefreshOnFocus();
  const latest = items[0];
  const state = latest ? summaries[latest.caseId] : undefined;

  return (
    <Screen headerless>
      <AppText variant="title">My plan</AppText>
      {!loaded || (latest && (!state || state.status === 'loading')) ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your plan" />
      ) : !latest ? (
        <Card style={{ alignItems: 'center', gap: space(3), paddingVertical: space(8) }}>
          <ClipboardList size={32} color={colors.textMuted} />
          <AppText variant="heading">No plan yet</AppText>
          <AppText muted style={{ textAlign: 'center' }}>
            Start an estimate on Home. It will appear here so you can pick it up later.
          </AppText>
          <Button label="Start on Home" variant="secondary" onPress={() => router.navigate('/')} />
        </Card>
      ) : state?.status === 'ok' ? (
        <View style={{ gap: space(3) }}>
          <CaseCard summary={state.summary} label="Most recent" />
          {items.length > 1 ? <Button label="See all in Activity" variant="ghost" onPress={() => router.navigate('/activity')} /> : null}
        </View>
      ) : state?.status === 'error' ? (
        <ErrorNotice error={state.error} onRetry={refresh} />
      ) : null}
    </Screen>
  );
}
