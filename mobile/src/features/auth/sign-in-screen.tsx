import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AppText, Button, Notice, PasswordField, Screen, TextField } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useAuth } from './auth-context';
import { MISSING_CREDENTIALS, signInErrorView, type SignInErrorView } from './auth-messages';

const NEW_PASSWORD_RULE = 'At least 12 characters with upper and lower case letters and a number.';

/**
 * Native sign-in for admin-created demo accounts (D-15), styled after design v3 "Hosted sign-in".
 * Covers the first-sign-in new-password challenge. No self-service sign-up or reset in the demo.
 */
export function SignInScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInErrorView | null>(null);
  const [showResetHelp, setShowResetHelp] = useState(false);

  if (auth.status === 'signed_in') return <Redirect href="/" />;

  const fail = (view: SignInErrorView) => {
    setError(view);
    AccessibilityInfo.announceForAccessibility(view.message);
  };

  const submit = async () => {
    if (busy) return;
    if (session ? newPassword.length < 12 : email.trim() === '' || password === '') {
      fail(session ? { kind: 'missing', tone: 'danger', message: NEW_PASSWORD_RULE } : MISSING_CREDENTIALS);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (session) {
        await auth.completeNewPassword(email, newPassword, session);
      } else {
        const result = await auth.signIn(email, password);
        if (result.kind === 'new_password_required') setSession(result.session);
      }
    } catch (caught) {
      fail(signInErrorView(caught));
    } finally {
      setBusy(false);
    }
  };

  const fieldInvalid = error?.kind === 'invalid' || error?.kind === 'missing';
  const clearError = () => setError(null);

  return (
    <Screen headerless>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel sign-in"
        onPress={() => router.replace('/welcome?note=cancelled')}
        style={{ minHeight: layout.minHitArea, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold, fontSize: 16 }}>
          Cancel
        </AppText>
      </Pressable>

      <BrandLockup size={26} />

      <View style={{ gap: space(1.5) }}>
        <AppText variant="title">{session ? 'Choose a new password' : 'Sign in'}</AppText>
        <AppText muted>
          {session ? 'This is your first sign-in. Set a password only you know.' : 'Use the email your team admin set up for you.'}
        </AppText>
      </View>

      {error ? <Notice tone={error.tone} title={error.message} /> : null}

      <View style={{ gap: space(4) }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearError();
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
          invalid={fieldInvalid && !session}
        />
        {session ? (
          <PasswordField
            label="New password"
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              clearError();
            }}
            autoComplete="new-password"
            helper={NEW_PASSWORD_RULE}
            invalid={fieldInvalid}
          />
        ) : (
          <PasswordField
            label="Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              clearError();
            }}
            autoComplete="current-password"
            invalid={fieldInvalid}
          />
        )}
      </View>

      {session ? null : (
        <View style={{ gap: space(2) }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showResetHelp }}
            onPress={() => setShowResetHelp((open) => !open)}
            style={{ minHeight: layout.minHitArea, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold, fontSize: 15 }}>
              Forgot password?
            </AppText>
          </Pressable>
          {showResetHelp ? (
            <Notice tone="neutral" title="Ask your team admin to reset it" body="Demo accounts are managed by the admin, so this app doesn’t send reset emails." />
          ) : null}
        </View>
      )}

      <Button label={busy ? 'Signing in…' : session ? 'Set password and continue' : 'Sign in'} onPress={submit} loading={busy} />

      <Notice tone="info" title="Demo environment" body="Use synthetic information only. Signing in identifies you to the app; it does not confirm your insurance." />
    </Screen>
  );
}
