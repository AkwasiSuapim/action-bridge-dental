import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LandingPage } from '../features/landing/landing-page';
import { useAuth } from './auth';
import { useDemo } from './demo-store';
import { useJob } from './job-store';

/** "maya.demo@example.com" → "Maya". Display name only; the profile page can change it. */
export function nameFromEmail(email: string): string {
  const first = email.split('@')[0]?.split(/[._+-]/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

/**
 * The in-app pages still run on local demo data. Their demo session follows the real Cognito
 * session: it starts for the signed-in email and is cleared when the session ends, so no demo
 * data outlives a sign-out or an expired session.
 */
export function SessionSync() {
  const auth = useAuth();
  const demo = useDemo();
  const demoEmail = demo.state.session?.email ?? null;
  useEffect(() => {
    if (auth.status === 'signed_out' && demoEmail) demo.signOut();
    if (auth.status === 'signed_in' && auth.email && demoEmail !== auth.email)
      demo.signIn({ name: nameFromEmail(auth.email), email: auth.email });
    // `demo` is a fresh object each render; the inputs that matter are listed.
  }, [auth.status, auth.email, demoEmail]);
  return null;
}

/** Route gate: signed-out visitors see the landing page at "/" and sign in for anything else. */
export function SignedIn() {
  const auth = useAuth();
  const { state } = useDemo();
  const location = useLocation();
  if (auth.status === 'loading')
    return (
      <p className="session-restoring" role="status">
        Restoring your session…
      </p>
    );
  if (auth.status === 'signed_out')
    return location.pathname === '/' ? (
      <LandingPage />
    ) : (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  // SessionSync starts the demo session on the next render.
  if (!state.session) return null;
  return <Outlet />;
}

/** Ends the session everywhere: background task, demo data and Cognito tokens. */
export function useEndSession() {
  const auth = useAuth();
  const demo = useDemo();
  const { cancel } = useJob();
  const navigate = useNavigate();
  return (reason: 'signed_out' | 'expired' = 'signed_out') => {
    cancel();
    demo.signOut();
    auth.signOut(reason);
    navigate('/sign-in', { replace: true });
  };
}
