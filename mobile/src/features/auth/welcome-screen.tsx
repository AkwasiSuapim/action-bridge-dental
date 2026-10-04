import { Redirect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Lock, Mail } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, ScrollView, View, useWindowDimensions, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BrandLockup } from '../../components/brand';
import { AppText, Button, Notice, PasswordField, TextField } from '../../components/ui';
import { useTheme } from '../../theme/theme';
import { fonts, layout, space } from '../../theme/tokens';
import { useAuth } from './auth-context';
import { MISSING_CREDENTIALS, signInErrorView, welcomeNote, type SignInErrorView } from './auth-messages';
import { welcomeImage } from './welcome-image';

const NEW_PASSWORD_RULE = 'At least 12 characters, with upper and lower case letters and a number.';
const SHEET_RADIUS = 28;

/**
 * Welcome and sign-in in one screen: photo on top, the form on a curved sheet below.
 * Accounts are admin-created (D-15), including the first-sign-in new-password step.
 */
export function WelcomeScreen() {
  const auth = useAuth();
  const { note } = useLocalSearchParams<{ note?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (auth.status === 'signed_in') return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        bounces={false}
      >
        <Hero />
        <View
          style={{
            flex: 1,
            marginTop: -SHEET_RADIUS,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            backgroundColor: colors.surface,
            alignItems: 'center',
            paddingTop: space(7),
            paddingBottom: Math.max(insets.bottom, space(4)),
            paddingLeft: insets.left + space(6),
            paddingRight: insets.right + space(6),
          }}
        >
          <SignInForm note={auth.status === 'loading' ? null : welcomeNote(note, auth.signedOutReason)} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Full-bleed photo, with a soft shade at the top so the status bar stays readable. */
function Hero() {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(Math.min(380, Math.max(220, height * 0.36))) + SHEET_RADIUS;

  return (
    <View style={{ height: heroHeight, backgroundColor: colors.surfaceMuted }}>
      {welcomeImage ? (
        <Image
          source={welcomeImage.source}
          accessibilityLabel={welcomeImage.alt}
          accessibilityRole="image"
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}
      <View aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96, pointerEvents: 'none' }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#heroShade)" />
        </Svg>
      </View>
    </View>
  );
}

function SignInForm({ note }: { note: string | null }) {
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
  const icon = { size: 20, color: colors.textMuted };

  return (
    <View style={{ flex: 1, width: '100%', maxWidth: 460, gap: space(5) }}>
      <BrandLockup size={34} />

      <View style={{ gap: space(1.5) }}>
        <AppText variant="display" accessibilityRole="header">
          {session ? 'Choose a new password' : 'Welcome back'}
        </AppText>
        <AppText muted>{session ? 'Set your own password to finish signing in.' : 'Sign in to see your dental cost estimates.'}</AppText>
      </View>

      {error ? <Notice tone={error.tone} title={error.message} /> : note ? <Notice tone="info" title={note} /> : null}

      <View style={{ gap: space(3) }}>
        {session ? (
          <PasswordField
            label="New password"
            hideLabel
            placeholder="New password"
            leading={<Lock {...icon} />}
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
              hideLabel
              placeholder="Email"
              leading={<Mail {...icon} />}
              value={email}
              onChangeText={edit(setEmail)}
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
              hideLabel
              placeholder="Password"
              leading={<Lock {...icon} />}
              value={password}
              onChangeText={edit(setPassword)}
              autoComplete="current-password"
              textContentType="password"
              invalid={invalid}
              inputRef={passwordRef}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <View style={{ alignItems: 'flex-end', gap: space(1) }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: resetHelp }}
                onPress={() => setResetHelp((open) => !open)}
                style={{ minHeight: layout.minHitArea, justifyContent: 'center' }}
              >
                <AppText variant="label" color={colors.primary} style={{ fontFamily: fonts.semibold }}>
                  Forgot password?
                </AppText>
              </Pressable>
              {resetHelp ? (
                <AppText variant="caption" muted>
                  Ask your account admin to reset it.
                </AppText>
              ) : null}
            </View>
          </>
        )}
      </View>

      <View style={{ gap: space(2) }}>
        <Button label={busy ? 'Signing in…' : session ? 'Set password and continue' : 'Sign in'} onPress={submit} loading={busy} />
        {session ? (
          <Button
            label="Use a different account"
            variant="ghost"
            onPress={() => {
              setSession(null);
              setNewPassword('');
              setPassword('');
              setError(null);
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, minHeight: space(4) }} />
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Estimates only. Your dentist and insurer decide final costs.
      </AppText>
    </View>
  );
}
