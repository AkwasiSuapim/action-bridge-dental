import { Redirect, router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View, type TextInput } from 'react-native';
import { BrandLockup } from '../../components/brand';
import { AppText, Button, Notice, PasswordField, Screen, TextField } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useAuth } from './auth-context';
import { MISSING_CREDENTIALS, signInErrorView, type SignInErrorView } from './auth-messages';

const NEW_PASSWORD_RULE = 'At least 12 characters, with upper and lower case letters and a number.';

/** Sign-in for admin-created accounts (D-15), including the first-sign-in new-password step. */
export function SignInScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInErrorView | null>(null);
  const [resetHelp, setResetHelp] = useState(false);

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

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError(null);
  };
  const invalid = error?.kind === 'invalid' || error?.kind === 'missing';

  return (
    <Screen headerless>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.replace('/welcome?note=cancelled')}
        hitSlop={8}
        style={{ width: layout.minHitArea, height: layout.minHitArea, marginLeft: -space(2.5), justifyContent: 'center', alignItems: 'center' }}
      >
        <ChevronLeft size={26} color={colors.text} />
      </Pressable>

      <BrandLockup size={26} />

      <View style={{ gap: space(1.5) }}>
        <AppText variant="title">{session ? 'Choose a new password' : 'Sign in'}</AppText>
        {session ? <AppText muted>Set your own password to finish signing in.</AppText> : null}
      </View>

      {error ? <Notice tone={error.tone} title={error.message} /> : null}

      <View style={{ gap: space(4) }}>
        {session ? (
          <PasswordField
            label="New password"
            value={newPassword}
            onChangeText={edit(setNewPassword)}
            autoComplete="new-password"
            textContentType="newPassword"
            helper={NEW_PASSWORD_RULE}
            invalid={invalid}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        ) : (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={edit(setEmail)}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              invalid={invalid}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <PasswordField
              label="Password"
              value={password}
              onChangeText={edit(setPassword)}
              autoComplete="current-password"
              textContentType="password"
              invalid={invalid}
              inputRef={passwordRef}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          </>
        )}
      </View>

      <Button label={busy ? 'Signing in…' : session ? 'Set password and continue' : 'Sign in'} onPress={submit} loading={busy} />

      {session ? null : (
        <View style={{ gap: space(2), alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: resetHelp }}
            onPress={() => setResetHelp((open) => !open)}
            style={{ minHeight: layout.minHitArea, justifyContent: 'center' }}
          >
            <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold, fontSize: 15 }}>
              Forgot password?
            </AppText>
          </Pressable>
          {resetHelp ? (
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>
              Ask your account admin to reset it.
            </AppText>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
