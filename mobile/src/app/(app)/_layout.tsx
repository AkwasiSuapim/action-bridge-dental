import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../features/auth/auth-context';
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
        <Stack.Screen name="case/[caseId]/facts" options={{ title: 'Check your details' }} />
        <Stack.Screen name="case/[caseId]/edit" options={{ title: 'Update a detail' }} />
        <Stack.Screen name="case/[caseId]/results" options={{ title: 'Your estimate' }} />
      </Stack>
    </CaseProvider>
  );
}
