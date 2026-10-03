import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppText, Notice, Screen } from '../components/ui';
import { AuthProvider } from '../features/auth/auth-context';
import { appConfig } from '../lib/config';
import { ApiProvider } from '../services/api-context';
import { ThemeProvider, useTheme } from '../theme/theme';
import { fonts } from '../theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>{fontsLoaded ? <Root /> : <Loading />}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { colors, dark } = useTheme();

  if (!appConfig.ok) {
    return (
      <Screen>
        <AppText variant="title">Configuration needed</AppText>
        <Notice tone="danger" title="The app is not connected to a live API" body={appConfig.problems.join('\n')} />
        <AppText variant="caption" muted>
          Copy mobile/.env.example to mobile/.env, fill in the stack outputs, then restart Expo.
        </AppText>
      </Screen>
    );
  }

  return (
    <AuthProvider config={appConfig.config}>
      <ApiProvider config={appConfig.config}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: fonts.semibold },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'ActionBridge Dental' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerBackVisible: false }} />
        </Stack>
      </ApiProvider>
    </AuthProvider>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
    </View>
  );
}
