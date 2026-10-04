import {
  ArrowLeft,
  ClipboardList,
  History,
  Home,
  LoaderCircle,
  LogOut,
  Menu,
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
import { isSampleCase } from '../domain/provenance';
import { useAuth } from '../state/auth';
import { CaseProvider, useCase } from '../state/case-store';
import { Badge, Brand, Button } from './ui';

const pages: [string, string][] = [
  ['/my-plan', 'My plan'],
  ['/activity', 'Activity'],
  ['/profile', 'Profile'],
  ['/intake/manual', 'Enter treatment details'],
  ['/intake/', 'New estimate'],
  ['/assistant/', 'Assistant'],
  ['/facts', 'Review your information'],
  ['/questions', 'A few details'],
  ['/options', 'Your dental options'],
  ['/self-pay', 'Your self-pay quote'],
  ['/details', 'Plan details'],
  ['/review', 'Review and save'],
  ['/saved', 'Saved plan'],
];
const titleFor = (path: string) =>
  path === '/'
    ? 'Home'
    : (pages.find(([p]) => path.startsWith(p))?.[1] ?? 'ActionBridge Dental');

/** Signed-in layout. Live data only: there are no demo controls or simulated states. */
export function Shell() {
  const { status } = useAuth();
  if (status === 'restoring')
    return (
      <div className="page narrow centered" role="status">
        <LoaderCircle className="spin" size={28} aria-hidden="true" />
        <p className="muted">Restoring your session…</p>
      </div>
    );
  if (status !== 'signed_in') return <Navigate to="/login" replace />;
  return (
    <CaseProvider>
      <ShellBody />
    </CaseProvider>
  );
}

function ShellBody() {
  const { session, signOut } = useAuth();
  const { record } = useCase();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const dark =
    ['/', '/facts', '/questions'].includes(location.pathname) ||
    location.pathname.startsWith('/intake/') ||
    location.pathname.startsWith('/assistant/');
  useEffect(() => {
    setMenu(false);
    window.scrollTo({ top: 0 });
    document.title = `${titleFor(location.pathname)} · ActionBridge Dental`;
  }, [location.pathname]);
  if (!session) return null;
  const leave = () => {
    void signOut();
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
              {session.name.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{session.name}</strong>
              <small>{session.email}</small>
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
          <h1>{titleFor(location.pathname)}</h1>
          {record && isSampleCase(record) && <Badge>Sample data</Badge>}
          <button
            className="header-account"
            onClick={() => navigate('/profile')}
          >
            <span className="avatar">
              {session.name.charAt(0).toUpperCase()}
            </span>
            <span>{session.name}</span>
          </button>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          Estimates only. Your dentist and insurer decide final costs.
        </footer>
      </div>
    </div>
  );
}
