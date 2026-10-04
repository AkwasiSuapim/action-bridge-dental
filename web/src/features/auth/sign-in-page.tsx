import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { CognitoError } from '../../../../mobile/src/features/auth/cognito';
import { config } from '../../lib/config';
import { useAuth } from '../../state/auth';
import '../../landing.css';

type Mode = 'signin' | 'create' | 'forgot';
const NEW_PASSWORD_RULE =
  'At least 12 characters, with upper and lower case letters and a number.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the pool's password policy so most mistakes are caught before calling Cognito. */
const meetsPasswordRule = (value: string) =>
  value.length >= 12 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value);

function errorMessage(caught: unknown): string {
  return caught instanceof CognitoError
    ? caught.message
    : 'Sign-in failed. Try again.';
}

/**
 * Sign in (design: Sign In v2) with the team's Cognito user pool. Accounts are created by the
 * team for the demo (D-10), so "create account" and "forgot password" explain that instead of
 * offering self-service; first sign-in asks for a new password.
 */
export function SignInPage() {
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('mode');
  const mode: Mode =
    requested === 'create' || requested === 'forgot' ? requested : 'signin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    message: string;
    field?: 'email' | 'password' | 'confirmation';
  } | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Sign in · ActionBridge Dental';
  }, []);

  if (auth.status === 'signed_in') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith('/') ? from : '/'} replace />;
  }

  const go = (next: Mode) => {
    setError(null);
    setPassword('');
    setParams(next === 'signin' ? {} : { mode: next }, { replace: true });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (session) {
      if (!meetsPasswordRule(newPassword)) {
        setError({ message: NEW_PASSWORD_RULE, field: 'password' });
        return;
      }
      if (confirmation !== newPassword) {
        setError({ message: 'Passwords must match.', field: 'confirmation' });
        return;
      }
    } else if (!EMAIL.test(email.trim())) {
      setError({ message: 'Enter a valid email address.', field: 'email' });
      return;
    } else if (!password) {
      setError({ message: 'Enter your password.', field: 'password' });
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (session) {
        await auth.completeNewPassword(email, newPassword, session);
      } else {
        const result = await auth.signIn(email, password);
        if (result.kind === 'new_password_required') {
          setSession(result.session);
          setPassword('');
        }
      }
    } catch (caught) {
      setError({ message: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  const note =
    auth.signedOutReason === 'expired'
      ? 'Your session expired. Sign in again to continue.'
      : auth.signedOutReason === 'signed_out'
        ? 'You’re signed out.'
        : null;

  const copy = session
    ? {
        eyebrow: 'NEW PASSWORD',
        title: 'Choose a new password to finish signing in.',
      }
    : {
        signin: {
          eyebrow: 'WELCOME BACK',
          title: 'Sign in to continue your saved plans.',
        },
        create: {
          eyebrow: 'NEW ACCOUNT',
          title: 'Accounts are set up by our team.',
        },
        forgot: {
          eyebrow: 'RESET PASSWORD',
          title: 'Ask the team to reset your password.',
        },
      }[mode];

  return (
    <div className="si">
      <aside className="si-aside">
        <img src="/assets/welcome.jpg" alt="" />
        <div className="si-aside-shade" aria-hidden="true" />
        <div className="si-aside-content">
          <Link
            to="/"
            className="si-brand"
            aria-label="ActionBridge Dental home"
          >
            <span className="lp-brand-name">ActionBridge</span>
            <span className="lp-brand-rule" />
            <span className="lp-brand-sub">Dental</span>
          </Link>
          <p className="si-tagline">
            A clearer way to understand your dental costs.
          </p>
        </div>
      </aside>

      <main className="si-main">
        <div className="si-back">
          <Link to="/">Back to site</Link>
        </div>
        <div className="si-form-wrap">
          <div className="si-panel">
            <div className="si-eyebrow">{copy.eyebrow}</div>
            <h1 className="si-title">{copy.title}</h1>

            {!config.ok && (
              <p className="si-notice si-alert" role="alert">
                Sign-in isn’t set up for this site yet. Add the Cognito settings
                (VITE_COGNITO_REGION and VITE_COGNITO_CLIENT_ID) and rebuild.
              </p>
            )}
            {config.ok && note && !error && mode === 'signin' && !session && (
              <p className="si-notice" role="status">
                {note}
              </p>
            )}
            {error && (
              <p className="si-notice si-alert" role="alert">
                {error.message}
              </p>
            )}

            {session ? (
              <form className="si-form" noValidate onSubmit={submit}>
                <div className="si-field">
                  <label htmlFor="si-new-password">New password</label>
                  <input
                    id="si-new-password"
                    className="si-input"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error?.field === 'password'}
                    aria-describedby="si-new-password-hint"
                    autoFocus
                  />
                  <span id="si-new-password-hint" className="si-hint">
                    {NEW_PASSWORD_RULE}
                  </span>
                </div>
                <div className="si-field">
                  <label htmlFor="si-confirm-password">Confirm password</label>
                  <input
                    id="si-confirm-password"
                    className="si-input"
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => {
                      setConfirmation(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error?.field === 'confirmation'}
                  />
                </div>
                <button className="si-submit" type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Set password and continue'}
                </button>
              </form>
            ) : mode === 'signin' ? (
              <form className="si-form" noValidate onSubmit={submit}>
                <div className="si-field">
                  <label htmlFor="si-email">Email</label>
                  <input
                    id="si-email"
                    className="si-input"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={
                      error?.field === 'email' || (!!error && !error.field)
                    }
                  />
                </div>
                <div className="si-field">
                  <div className="si-field-head">
                    <label htmlFor="si-password">Password</label>
                    <button
                      type="button"
                      className="si-link"
                      onClick={() => go('forgot')}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="si-password"
                    ref={passwordRef}
                    className="si-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={
                      error?.field === 'password' || (!!error && !error.field)
                    }
                  />
                </div>
                <button
                  className="si-submit"
                  type="submit"
                  disabled={busy || !config.ok}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            ) : (
              <p className="si-message">
                {mode === 'create'
                  ? 'ActionBridge Dental is a demo, so accounts are created by the ActionBridge team. Ask the team for an account, then sign in with the email and temporary password they give you.'
                  : 'During the demo, passwords are reset by the ActionBridge team. Ask them for a new temporary password, then sign in and choose your own.'}
              </p>
            )}

            <div className="si-switch">
              {session ? (
                <>
                  <span>Not you?</span>
                  <button
                    type="button"
                    className="si-link"
                    onClick={() => {
                      setSession(null);
                      setNewPassword('');
                      setConfirmation('');
                      setError(null);
                    }}
                  >
                    Use a different account
                  </button>
                </>
              ) : mode === 'signin' ? (
                <>
                  <span>New to ActionBridge?</span>
                  <button
                    type="button"
                    className="si-link"
                    onClick={() => go('create')}
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'create'
                      ? 'Already have an account?'
                      : 'Remembered it?'}
                  </span>
                  <button
                    type="button"
                    className="si-link"
                    onClick={() => go('signin')}
                  >
                    {mode === 'create' ? 'Sign in' : 'Back to sign in'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <p className="si-foot">
          Estimates only. Your dentist and insurer determine final treatment and
          costs.
        </p>
      </main>
    </div>
  );
}
