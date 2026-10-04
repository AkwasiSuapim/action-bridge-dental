import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Brand, Button, Field, Notice } from '../../components/ui';
import { useDemo } from '../../state/demo-store';

export function LoginPage() {
  const { state, signIn } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<
    'signin' | 'create' | 'forgot' | 'sent' | 'new-password'
  >('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (state.session) return <Navigate to="/" replace />;
  const switchView = (next: typeof view) => {
    setView(next);
    setErrors({});
    setPassword('');
    setConfirmation('');
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = 'Enter a valid email address.';
    if (view !== 'forgot' && !password) next.password = 'Enter your password.';
    if (view === 'create') {
      if (!name.trim()) next.name = 'Enter your name.';
      if (password.length < 8) next.password = 'Use at least 8 characters.';
      if (confirmation !== password)
        next.confirmation = 'Passwords must match.';
    }
    if (view === 'new-password') {
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
    if (view === 'forgot') {
      setView('sent');
      return;
    }
    if (
      view === 'signin' &&
      (email.trim().toLowerCase() !== 'jordan@example.com' ||
        password !== 'DentalDemo123!')
    ) {
      setErrors({
        form: 'Demo credentials did not match. Use Fill demo credentials to try the sample.',
      });
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => {
      signIn({
        name: view === 'create' ? name.trim() : 'Jordan',
        email: email.trim().toLowerCase(),
      });
      setPassword('');
      setConfirmation('');
      navigate('/', { replace: true });
    }, 550);
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
        <div className="login-badge">
          <Badge>Demo mode · Sample data</Badge>
        </div>
        <div className="login-form-wrap">
          <form className="stack login-form" noValidate onSubmit={submit}>
            {location.state?.expired && (
              <Notice>
                Your demo session expired. Sign in again to start a new session.
              </Notice>
            )}
            <div>
              <h1>
                {view === 'new-password'
                  ? 'Choose a new password'
                  : view === 'signin'
                    ? 'Welcome to ActionBridge Dental'
                    : view === 'create'
                      ? 'Create a demo account'
                      : view === 'forgot'
                        ? 'Reset your password'
                        : 'Demo reset confirmation. No email was sent.'}
              </h1>
              <p className="muted">
                {view === 'new-password'
                  ? 'Finish the first-sign-in step for a demo account. This is a simulation; no password is stored or changed.'
                  : view === 'signin'
                    ? 'Understand your dental costs. Plan your next step.'
                    : view === 'create'
                      ? 'Stays in this browser. No real account is created.'
                      : view === 'forgot'
                        ? 'Enter your email. In this demo, nothing is sent.'
                        : `A real reset link would go to ${email}. Use the demo credentials to sign in.`}
              </p>
            </div>
            {view === 'signin' && (
              <Button
                variant="secondary"
                icon={KeyRound}
                className="demo-fill"
                onClick={() => {
                  setEmail('jordan@example.com');
                  setPassword('DentalDemo123!');
                  setErrors({});
                }}
              >
                Fill demo credentials
              </Button>
            )}
            {errors.form && <Notice tone="danger">{errors.form}</Notice>}
            {view === 'create' && (
              <Field label="Name" error={errors.name}>
                <input
                  autoComplete="name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!errors.name}
                />
              </Field>
            )}
            {view !== 'sent' && (
              <Field label="Email" error={errors.email}>
                <input
                  type="email"
                  readOnly={view === 'new-password'}
                  autoComplete={view === 'signin' ? 'username' : 'email'}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                />
              </Field>
            )}
            {(view === 'signin' ||
              view === 'create' ||
              view === 'new-password') && (
              <>
                <div>
                  <div className="password-label">
                    <span>Password</span>
                    {view === 'signin' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => switchView('forgot')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Field
                    label={
                      view === 'new-password'
                        ? 'New password'
                        : view === 'create'
                          ? 'Choose a password'
                          : 'Your password'
                    }
                    error={errors.password}
                  >
                    <div className="password-control">
                      <input
                        type={show ? 'text' : 'password'}
                        autoComplete={
                          view === 'create' || view === 'new-password'
                            ? 'new-password'
                            : 'current-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!errors.password}
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
                </div>
                {(view === 'create' || view === 'new-password') && (
                  <Field label="Confirm password" error={errors.confirmation}>
                    <input
                      type={show ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      aria-invalid={!!errors.confirmation}
                    />
                  </Field>
                )}
              </>
            )}
            {view !== 'sent' && (
              <Button type="submit" busy={busy} className="full">
                {busy
                  ? 'Signing in…'
                  : view === 'new-password'
                    ? 'Set password and continue'
                    : view === 'signin'
                      ? 'Sign in'
                      : view === 'create'
                        ? 'Create demo account'
                        : 'Send reset link'}
              </Button>
            )}
            {view === 'signin' && (
              <Button
                variant="ghost"
                onClick={() => {
                  switchView('new-password');
                  setEmail('jordan@example.com');
                }}
              >
                Preview first-sign-in password change
              </Button>
            )}
            {view === 'signin' ? (
              <p className="auth-switch muted">
                New here?{' '}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => switchView('create')}
                >
                  Create account
                </button>
              </p>
            ) : (
              <Button variant="ghost" onClick={() => switchView('signin')}>
                Back to sign in
              </Button>
            )}
          </form>
        </div>
        <p className="login-fine-print">
          Simulated sign-in. Passwords are never stored.
          <br />
          Estimates only — your dentist and insurer decide final costs.
        </p>
      </section>
    </div>
  );
}
