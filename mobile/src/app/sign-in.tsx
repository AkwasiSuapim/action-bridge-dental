import { Redirect } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, Notice, Screen, TextField } from '../components/ui';
import { useAuth } from '../features/auth/auth-context';
import { CognitoError } from '../features/auth/cognito';

/** Native sign-in for admin-created demo accounts (synthetic data only). */
export default function SignInScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'signed_in') return <Redirect href="/" />;

  const submit = async () => {
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
      setError(caught instanceof CognitoError ? caught.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="display">Understand your dental costs before treatment.</AppText>
      <AppText muted>Sign in with your demo account to continue.</AppText>
      <Card>
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
        {session ? (
          <TextField
            label="Choose a new password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="password"
            helper="At least 12 characters with upper and lower case letters and a number."
          />
        ) : (
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        )}
        {error ? <Notice tone="danger" title={error} /> : null}
        <Button
          label={session ? 'Set password and continue' : 'Sign in'}
          onPress={submit}
          loading={busy}
          disabled={email.trim() === '' || (session ? newPassword.length < 12 : password === '')}
        />
      </Card>
      <Notice
        tone="info"
        title="Demo environment"
        body="Use synthetic information only. Signing in identifies you to the app; it does not confirm your insurance."
      />
    </Screen>
  );
}
