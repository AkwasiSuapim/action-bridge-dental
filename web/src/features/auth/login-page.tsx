import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Brand, Button, Field, Notice } from '../../components/ui';
import { appConfig } from '../../config';
import { CognitoError } from '../../services/cognito';
import { useAuth } from '../../state/auth';

/**
 * Real sign-in with the team's Cognito user pool. Accounts are created by an admin (no public
 * sign-up); a first sign-in asks for a new password, as on the phone.
 */
export function LoginPage() {
  const { status, ended, signIn, completeNewPassword } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<'signin' | 'new-password'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (status === 'signed_in') return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (view === 'signin') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        next.email = 'Enter a valid email address.';
      if (!password) next.password = 'Enter your password.';
    } else {
      if (
        password.length < 12 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password)
      )
        next.password =
          'Use at least 12 characters, with upper and lower case letters and a number.';
      if (confirmation !== password)
        next.confirmation = 'Passwords must match.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (view === 'signin') {
        const result = await signIn(email, password);
        if (result.kind === 'new_password_required') {
          setView('new-password');
          setPassword('');
          setConfirmation('');
          return;
        }
      } else {
        await completeNewPassword(password);
      }
      setPassword('');
      setConfirmation('');
      navigate('/', { replace: true });
    } catch (caught) {
      setErrors({
        form:
          caught instanceof CognitoError
            ? caught.message
            : 'Sign-in failed. Try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login dark">
      <section className="login-art" aria-label="About ActionBridge Dental">
        <img
          src="/assets/welcome.jpg"
          alt="A model tooth and dental mirror on a table in a bright clinic"
        />
        <div className="login-overlay" />
        <div className="login-art-content">
          <Brand />
          <div>
            <h2>A clearer plan for your dental care.</h2>
            <p>
              Compare treatment timing against your benefits, and take a clear
              question back to your dentist.
            </p>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <form
            className="stack login-form"
            noValidate
            onSubmit={(e) => void submit(e)}
          >
            {!appConfig.ok && (
              <Notice tone="danger">
                This site is not configured: {appConfig.problems.join(' ')}
              </Notice>
            )}
            {ended === 'expired' && view === 'signin' && (
              <Notice>Your session ended. Sign in again to continue.</Notice>
            )}
            <div>
              <h1>
                {view === 'new-password'
                  ? 'Choose a new password'
                  : 'Welcome to ActionBridge Dental'}
              </h1>
              <p className="muted">
                {view === 'new-password'
                  ? 'This is your first sign-in. Choose a password only you know.'
                  : 'Understand your dental costs. Plan your next step.'}
              </p>
            </div>
            {errors.form && <Notice tone="danger">{errors.form}</Notice>}
            <Field label="Email" error={errors.email}>
              <input
                type="email"
                readOnly={view === 'new-password'}
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label={view === 'new-password' ? 'New password' : 'Password'}
              error={errors.password}
            >
              <div className="password-control">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete={
                    view === 'new-password'
                      ? 'new-password'
                      : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-pressed={show}
                >
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
            {view === 'new-password' && (
              <Field label="Confirm password" error={errors.confirmation}>
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
            )}
            <Button
              type="submit"
              busy={busy}
              className="full"
              disabled={!appConfig.ok}
            >
              {busy
                ? 'Signing in…'
                : view === 'new-password'
                  ? 'Set password and continue'
                  : 'Sign in'}
            </Button>
            {view === 'new-password' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setView('signin');
                  setErrors({});
                  setPassword('');
                  setConfirmation('');
                }}
              >
                Back to sign in
              </Button>
            )}
            <p className="small muted">
              Accounts are created by your team admin. Forgot your password? Ask
              your admin to reset it.
            </p>
          </form>
        </div>
        <p className="login-fine-print">
          Use made-up details in this demo — no names, member IDs or health
          history.
          <br />
          Estimates only — your dentist and insurer decide final costs.
        </p>
      </section>
    </div>
  );
}
