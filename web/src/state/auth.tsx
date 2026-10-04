import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appConfig } from '../config';
import { createApiClient, type ApiClient } from '../services/api';
import {
  CognitoError,
  createCognitoClient,
  type Tokens,
} from '../services/cognito';

/**
 * Real Cognito sign-in for the web app. The access token lives in memory only. The refresh token
 * and the email are kept in sessionStorage (this tab only, cleared on sign-out or when the tab
 * closes) so a reload doesn't sign the user out. Nothing goes to localStorage.
 */
export type Session = { email: string; name: string };
type Status = 'restoring' | 'signed_out' | 'signed_in';
type EndReason = 'expired' | 'signed_out';

type AuthStore = {
  status: Status;
  session: Session | null;
  ended: EndReason | null;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ kind: 'signed_in' } | { kind: 'new_password_required' }>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  signOut: (reason?: EndReason) => Promise<void>;
  rename: (name: string) => void;
  api: ApiClient | null;
};

const SESSION_KEY = 'actionbridge.web.session.v1';
const NAME_KEY = 'actionbridge.web.names.v1';
const Context = createContext<AuthStore | null>(null);

function readStored(): { email: string; refreshToken: string } | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return raw &&
      typeof raw.email === 'string' &&
      typeof raw.refreshToken === 'string'
      ? raw
      : null;
  } catch {
    return null;
  }
}
function store(value: { email: string; refreshToken: string } | null) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Storage blocked: the session lasts until reload. */
  }
}
/** Display names are a per-browser preference, keyed by email; Cognito holds no profile here. */
function displayName(email: string): string {
  try {
    const names = JSON.parse(localStorage.getItem(NAME_KEY) ?? '{}');
    if (typeof names[email] === 'string' && names[email]) return names[email];
  } catch {
    /* ignore */
  }
  const local = email.split('@')[0] ?? email;
  const first = local.split(/[._+-]/)[0] || local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cognito = useMemo(
    () =>
      appConfig.ok
        ? createCognitoClient({
            region: appConfig.config.cognitoRegion,
            clientId: appConfig.config.cognitoClientId,
          })
        : null,
    [],
  );
  const [status, setStatus] = useState<Status>(() =>
    readStored() ? 'restoring' : 'signed_out',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ended, setEnded] = useState<EndReason | null>(null);
  const tokens = useRef<Tokens | null>(null);
  const email = useRef<string | null>(null);
  const challenge = useRef<string | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const begin = useCallback((address: string, next: Tokens) => {
    tokens.current = next;
    email.current = address;
    store({ email: address, refreshToken: next.refreshToken });
    setSession({ email: address, name: displayName(address) });
    setEnded(null);
    setStatus('signed_in');
  }, []);

  const end = useCallback((reason: EndReason) => {
    tokens.current = null;
    email.current = null;
    store(null);
    setSession(null);
    setEnded(reason);
    setStatus('signed_out');
  }, []);

  /** A valid access token, refreshed a minute before expiry; null when the session is over. */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const current = tokens.current;
    if (current && current.expiresAt - 60_000 > Date.now())
      return current.accessToken;
    const refreshToken = current?.refreshToken ?? readStored()?.refreshToken;
    if (!cognito || !refreshToken) return null;
    refreshing.current ??= cognito
      .refresh(refreshToken)
      .then((next) => {
        tokens.current = next;
        return next.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [cognito]);

  // Restore a session in this tab after a reload.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    let live = true;
    void getAccessToken().then((token) => {
      if (!live) return;
      if (token && tokens.current) begin(stored.email, tokens.current);
      else end('expired');
    });
    return () => {
      live = false;
    };
  }, [begin, end, getAccessToken]);

  const api = useMemo(
    () =>
      appConfig.ok
        ? createApiClient({
            baseUrl: appConfig.config.apiBaseUrl,
            getAccessToken,
            onUnauthenticated: () => end('expired'),
          })
        : null,
    [getAccessToken, end],
  );

  const value: AuthStore = {
    status,
    session,
    ended,
    api,
    signIn: async (address, password) => {
      if (!cognito)
        throw new CognitoError('CONFIG', 'Sign-in is not configured.');
      const normalized = address.trim().toLowerCase();
      const result = await cognito.signIn(normalized, password);
      if (result.kind === 'new_password_required') {
        email.current = normalized;
        challenge.current = result.session;
        return { kind: 'new_password_required' };
      }
      begin(normalized, result.tokens);
      return { kind: 'signed_in' };
    },
    completeNewPassword: async (newPassword) => {
      if (!cognito || !email.current || !challenge.current)
        throw new CognitoError('SESSION', 'Start again from sign-in.');
      const next = await cognito.completeNewPassword(
        email.current,
        newPassword,
        challenge.current,
      );
      challenge.current = null;
      begin(email.current, next);
    },
    signOut: async (reason = 'signed_out') => {
      const refreshToken = tokens.current?.refreshToken;
      end(reason);
      if (cognito && refreshToken) await cognito.revoke(refreshToken);
    },
    rename: (name) => {
      if (!session) return;
      try {
        const names = JSON.parse(localStorage.getItem(NAME_KEY) ?? '{}');
        localStorage.setItem(
          NAME_KEY,
          JSON.stringify({ ...names, [session.email]: name }),
        );
      } catch {
        /* ignore */
      }
      setSession({ ...session, name });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing auth provider');
  return context;
}

/** The API client for signed-in pages. */
export function useApi(): ApiClient {
  const { api } = useAuth();
  if (!api) throw new Error('The API is not configured');
  return api;
}
