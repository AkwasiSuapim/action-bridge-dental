import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../features/auth/auth-context';
import { RecentCasesProvider } from '../../features/activity/recent-cases';
import { CaseProvider } from '../../features/case/case-store';
import { useTheme } from '../../theme/theme';
import { fonts } from '../../theme/tokens';

/** Every screen in this group needs a signed-in user; signed-out users go to Welcome. */
export default function SignedInLayout() {
  const auth = useAuth();
  const { colors } = useTheme();

  if (auth.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Restoring your session" />
      </View>
    );
  }
  if (auth.status === 'signed_out') return <Redirect href="/welcome" />;

  return (
    <CaseProvider>
      <RecentCasesProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: fonts.semibold },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="case/new" options={{ title: 'New estimate' }} />
          <Stack.Screen name="case/describe" options={{ title: 'Describe your situation' }} />
          <Stack.Screen name="case/[caseId]/assistant" options={{ title: 'Assistant', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="case/[caseId]/questions" options={{ title: 'A few details' }} />
          <Stack.Screen name="case/[caseId]/rules" options={{ title: 'Plan coverage' }} />
          <Stack.Screen name="case/[caseId]/facts" options={{ title: 'Check your details' }} />
          <Stack.Screen name="case/[caseId]/edit" options={{ title: 'Update a detail' }} />
          <Stack.Screen name="case/[caseId]/options" options={{ title: 'Your options' }} />
          <Stack.Screen name="case/[caseId]/self-pay" options={{ title: 'Self-pay quotes', presentation: 'modal' }} />
          <Stack.Screen name="case/[caseId]/plan" options={{ title: 'Plan details' }} />
          <Stack.Screen name="case/[caseId]/sources" options={{ title: 'Where these numbers come from', presentation: 'modal' }} />
          <Stack.Screen name="case/[caseId]/review" options={{ title: 'Review your plan' }} />
          <Stack.Screen name="case/[caseId]/saved" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      </RecentCasesProvider>
    </CaseProvider>
  );
}
