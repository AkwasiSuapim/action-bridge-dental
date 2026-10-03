import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Screen } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { useFocusStatusBar } from '../../theme/status-bar';
import { fonts, space } from '../../theme/tokens';
import { useAuth } from '../auth/auth-context';

/**
 * Profile (design v3 "Profile"), limited to what is real today: the signed-in account, the privacy
 * statement and sign-out. Stored documents, permissions and "Delete all my data" need upload and
 * deletion APIs and are added with those features.
 */
export function ProfileScreen() {
  const auth = useAuth();
  const { colors, dark } = useTheme();
  const [busy, setBusy] = useState(false);
  useFocusStatusBar(dark ? 'light' : 'dark');

  const initial = auth.email?.trim().charAt(0).toUpperCase() || '?';

  return (
    <Screen headerless>
      <AppText variant="title">Profile</AppText>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
          <View
            aria-hidden
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText variant="heading" color={colors.primary} style={{ fontFamily: fonts.bold }}>
              {initial}
            </AppText>
          </View>
          <View style={{ flex: 1, gap: space(0.5) }}>
            <AppText variant="label" muted>
              Signed in as
            </AppText>
            <AppText style={{ fontFamily: fonts.semibold }}>{auth.email ?? 'Unknown account'}</AppText>
          </View>
        </View>
      </Card>

      <Card>
        <AppText variant="heading">Privacy</AppText>
        <AppText variant="caption">
          Your answers are used only to build your plans. We don’t share them with dentists, insurers or employers.
        </AppText>
      </Card>

      <Button
        label="Sign out"
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await auth.signOut();
        }}
      />
    </Screen>
  );
}
