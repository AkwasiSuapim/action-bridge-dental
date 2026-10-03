import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, View } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AppText, Button, Notice, Screen } from '../../components/ui';
import { ThemeProvider, useTheme } from '../../theme/theme';
import { layout, space } from '../../theme/tokens';
import { useAuth } from './auth-context';
import { welcomeNote } from './auth-messages';
import { welcomeImage } from './welcome-image';

/** Welcome (design v3), always dark. Accounts are admin-created for the demo, so sign-in is the only action. */
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
  return (
    <Screen headerless>
      <BrandLockup />
      <WelcomeHero />
      {note ? <Notice tone="info" title={note} /> : null}
      <View style={{ gap: space(3) }}>
        <AppText variant="display">A clearer plan for your dental care.</AppText>
        <AppText muted>Understand your estimate, explore your benefits, and choose your next step.</AppText>
      </View>
      <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Estimates only. Your dentist and insurer decide final costs.
      </AppText>
    </Screen>
  );
}

function WelcomeHero() {
  const { colors } = useTheme();
  const frame = { width: '100%', aspectRatio: 4 / 3, maxHeight: 340, borderRadius: layout.radius + 8, overflow: 'hidden' } as const;

  if (welcomeImage) {
    return <Image source={welcomeImage.source} accessibilityLabel={welcomeImage.alt} accessibilityRole="image" resizeMode="cover" style={frame} />;
  }
  return (
    <View
      aria-hidden
      style={[frame, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
    />
  );
}
