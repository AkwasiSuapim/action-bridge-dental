import {
  ArrowLeft,
  ClipboardList,
  History,
  Home,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useDemo } from '../state/demo-store';
import { useJob } from '../state/job-store';
import { Badge, Brand, Button, Dialog } from './ui';

const pages: Record<string, string> = {
  '/': 'Home',
  '/my-plan': 'My plan',
  '/activity': 'Activity',
  '/profile': 'Profile',
  '/intake/speak': 'Describe your treatment',
  '/intake/upload': 'Add a document',
  '/intake/photo': 'Take a photo',
  '/intake/type': 'Describe your treatment',
  '/intake/manual': 'Enter treatment details',
  '/facts': 'Review your information',
  '/questions': 'A quick detail',
  '/working': 'Benefits analysis',
  '/options': 'Your dental options',
  '/self-pay': 'Your self-pay quote',
  '/details': 'Plan details',
  '/review': 'Review and save',
  '/saved': 'Saved plan',
};
export function Shell() {
  const { state, signOut, reset, startSample, edit, setCaseFlags } = useDemo();
  const { job, controls, setControl, cancel } = useJob();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const dark =
    ['/', '/facts', '/questions', '/working'].includes(location.pathname) ||
    location.pathname.startsWith('/intake/');
  useEffect(() => {
    setMenu(false);
    setDemoOpen(false);
    window.scrollTo({ top: 0 });
    document.title = `${pages[location.pathname] ?? 'Home'} · ActionBridge Dental`;
  }, [location.pathname]);
  if (!state.session) return <Navigate to="/login" replace />;
  const leave = () => {
    cancel();
    signOut();
    navigate('/login', { replace: true });
  };
  return (
    <div className={`app-shell ${dark ? 'dark' : 'light'}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? 'mobile-open' : ''}`}>
        <Brand compact />
        <nav aria-label="Main navigation">
          {[
            { to: '/', label: 'Home', Icon: Home },
            { to: '/my-plan', label: 'My plan', Icon: ClipboardList },
            { to: '/activity', label: 'Activity', Icon: History },
            { to: '/profile', label: 'Profile', Icon: UserRound },
          ].map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-link selected' : 'nav-link'
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={19} />
            <p>
              A clearer next step.
              <br />
              <span>You stay in control.</span>
            </p>
          </div>
          <NavLink
            className="account"
            to="/profile"
            aria-label="Account profile"
          >
            <span className="avatar">
              {state.session.name.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{state.session.name}</strong>
              <small>Demo account</small>
            </span>
          </NavLink>
          <Button variant="ghost" icon={LogOut} onClick={leave}>
            Sign out
          </Button>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="app-body">
        <header className="topbar">
          <Button
            variant="ghost"
            className="mobile-menu"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            icon={Menu}
          />
          {!['/', '/my-plan', '/activity', '/profile'].includes(
            location.pathname,
          ) && (
            <Button
              variant="ghost"
              aria-label="Back"
              className="back-button"
              icon={ArrowLeft}
              onClick={() => {
                if (location.pathname === '/saved') navigate('/my-plan');
                else if (location.key === 'default') navigate('/');
                else navigate(-1);
              }}
            />
          )}
          <h1>{pages[location.pathname] ?? 'ActionBridge Dental'}</h1>
          <Badge>Demo mode · Sample data</Badge>
          <Button
            variant="secondary"
            className="demo-control-button"
            icon={Settings2}
            aria-label="Demo controls"
            onClick={() => setDemoOpen(true)}
          >
            <span>Demo controls</span>
          </Button>
          <button
            className="header-account"
            onClick={() => navigate('/profile')}
          >
            <span className="avatar">
              {state.session.name.charAt(0).toUpperCase()}
            </span>
            <span>{state.session.name}</span>
          </button>
        </header>
        {job.status === 'running' && location.pathname !== '/working' && (
          <button
            className="background-banner"
            onClick={() => navigate('/working')}
          >
            Sample analysis is continuing in the background{' '}
            <span>View progress →</span>
          </button>
        )}
        {job.status === 'completed' && location.pathname === '/' && (
          <button
            className="background-banner"
            onClick={() => navigate('/options')}
          >
            Your sample comparison is ready <span>View options →</span>
          </button>
        )}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          Estimates only. Your dentist and insurer decide final costs.
        </footer>
      </div>
      {demoOpen && (
        <Dialog title="Demo controls" onClose={() => setDemoOpen(false)}>
          <p className="muted small">
            Explore recovery states. These controls simulate behavior locally.
          </p>
          {(
            [
              {
                key: 'failSave',
                label: 'Save failure',
                help: 'Show a failed save with retry and preserved consent.',
              },
              {
                key: 'failAnalysis',
                label: 'Analysis failure',
                help: 'Interrupt sample analysis; retry after switching this off.',
              },
              {
                key: 'denyVoice',
                label: 'Microphone unavailable',
                help: 'Show the simulated permission fallback.',
              },
              {
                key: 'denyCamera',
                label: 'Camera unavailable',
                help: 'Show the simulated camera fallback.',
              },
            ] as const
          ).map((c) => (
            <label className="toggle-row" key={c.key}>
              <span>
                <strong>{c.label}</strong>
                <small className="muted">{c.help}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={controls[c.key]}
                onChange={(e) => setControl(c.key, e.target.checked)}
              />
            </label>
          ))}
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              if (!state.input) startSample();
              else
                edit((input) => {
                  const year = Object.values(input.planYears)[0];
                  if (year) year.insurerAlreadyPaidCents = null;
                });
              setDemoOpen(false);
              navigate('/questions');
            }}
          >
            Load incomplete-information example
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              if (!state.input) startSample();
              setCaseFlags({ deductibleConflict: true });
              setDemoOpen(false);
              navigate('/questions');
            }}
          >
            Show conflicting deductible details
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              if (!state.input) startSample();
              setCaseFlags({ documentNeeded: true });
              setDemoOpen(false);
              navigate('/questions');
            }}
          >
            Show missing-document question
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              if (!state.input) startSample();
              edit((input) => {
                input.planYears = {};
              });
              setDemoOpen(false);
              navigate('/questions');
            }}
          >
            Show benefit-year date question
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              reset();
              setDemoOpen(false);
              navigate('/');
            }}
          >
            Show empty state
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancel();
              signOut();
              navigate('/login', { state: { expired: true } });
            }}
          >
            Expire session
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDemoOpen(false);
              setResetOpen(true);
            }}
          >
            Reset demo
          </Button>
        </Dialog>
      )}
      {resetOpen && (
        <Dialog title="Reset the demo?" onClose={() => setResetOpen(false)}>
          <p>
            This clears your fictional case, saved plan, activity and local
            reminder. Any running sample analysis will stop.
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Keep my demo
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                cancel();
                reset();
                setResetOpen(false);
                navigate('/');
              }}
            >
              Reset demo
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
