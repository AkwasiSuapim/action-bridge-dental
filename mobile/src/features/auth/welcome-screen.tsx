import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { BrandLockup, BrandMark } from '../../components/brand';
import { AppText, Button, Notice, Screen } from '../../components/ui';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { layout, space } from '../../theme/tokens';
import { useAuth } from './auth-context';
import { welcomeNote } from './auth-messages';

/**
 * Welcome (design v3 "Welcome", always dark). Only sign-in is offered: accounts are admin-created
 * for the demo (D-15), and the sample needs the live API, which needs a signed-in user — so
 * "Create account" and "Explore a sample" from the mockup are not shown here.
 */
export function WelcomeScreen() {
  const auth = useAuth();
  const { note } = useLocalSearchParams<{ note?: string }>();

  if (auth.status === 'signed_in') return <Redirect href="/" />;

  return (
    <ThemeProvider scheme="dark">
      <StatusBar style="light" />
      <WelcomeBody note={auth.status === 'loading' ? null : welcomeNote(note, auth.signedOutReason)} />
    </ThemeProvider>
  );
}

function WelcomeBody({ note }: { note: string | null }) {
  const { colors } = useTheme();
  return (
    <Screen headerless>
      <BrandLockup />

      {/* Decorative stand-in until a licensed image is chosen (design handoff: image provenance). */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          minHeight: 196,
          borderRadius: layout.radius + 8,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ padding: space(6), borderRadius: 999, backgroundColor: colors.primarySoft }}>
          <BrandMark size={72} />
        </View>
      </View>

      {note ? <Notice tone="info" title={note} /> : null}

      <View style={{ gap: space(3) }}>
        <AppText variant="display">A clearer plan for your dental care.</AppText>
        <AppText muted>Understand your estimate, explore your benefits, and choose your next step.</AppText>
      </View>

      <View style={{ gap: space(3) }}>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>
          Demo accounts are set up by your team admin. Use synthetic information only.
        </AppText>
      </View>

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Estimates only. Your dentist and insurer decide final costs.
      </AppText>
    </Screen>
  );
}
