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
// Shared with the mobile app: a dependency-free Cognito client over HTTPS (D-15).
import {
  CognitoError,
  createCognitoClient,
  type SignInResult,
  type Tokens,
} from '../../../mobile/src/features/auth/cognito';
import { config } from '../lib/config';

/**
 * Real Cognito session for the web app. The refresh token and email are kept in sessionStorage,
 * so a reload keeps the user signed in and closing the tab ends the session; the access token
 * stays in memory. Signing out clears both and revokes the refresh token.
 */
type Status = 'loading' | 'signed_out' | 'signed_in';
/** Why the user is signed out, so the sign-in page can say so. Null on a fresh visit. */
export type SignedOutReason = 'expired' | 'signed_out' | null;

interface AuthValue {
  status: Status;
  email: string | null;
  signedOutReason: SignedOutReason;
  signIn(email: string, password: string): Promise<SignInResult>;
  completeNewPassword(
    email: string,
    newPassword: string,
    session: string,
  ): Promise<void>;
  signOut(reason?: 'signed_out' | 'expired'): void;
  /** A valid access token, refreshed within a minute of expiry; signs out if refresh fails. */
  getAccessToken(): Promise<string | null>;
}

const REFRESH_KEY = 'actionbridge.web.refreshToken';
const EMAIL_KEY = 'actionbridge.web.email';
const EXPIRY_MARGIN_MS = 60_000;

/** Blocked storage (private mode, strict settings) degrades to a memory-only session. */
const tabStorage = {
  get(key: string) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* memory only */
    }
  },
  remove(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* memory only */
    }
  },
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cognito = useMemo(
    () =>
      config.ok
        ? createCognitoClient({
            region: config.cognitoRegion,
            clientId: config.cognitoClientId,
          })
        : null,
    [],
  );
  const [status, setStatus] = useState<Status>(() =>
    cognito && tabStorage.get(REFRESH_KEY) ? 'loading' : 'signed_out',
  );
  const [email, setEmail] = useState<string | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason>(null);
  const tokens = useRef<Tokens | null>(null);
  const refreshing = useRef<Promise<Tokens | null> | null>(null);

  const clear = useCallback((reason: SignedOutReason) => {
    tokens.current = null;
    tabStorage.remove(REFRESH_KEY);
    tabStorage.remove(EMAIL_KEY);
    setEmail(null);
    setSignedOutReason(reason);
    setStatus('signed_out');
  }, []);

  const accept = useCallback((next: Tokens, who: string) => {
    tokens.current = next;
    tabStorage.set(REFRESH_KEY, next.refreshToken);
    tabStorage.set(EMAIL_KEY, who);
    setEmail(who);
    setSignedOutReason(null);
    setStatus('signed_in');
  }, []);

  const refresh = useCallback(async (): Promise<Tokens | null> => {
    if (!cognito) return null;
    refreshing.current ??= (async () => {
      const stored =
        tokens.current?.refreshToken ?? tabStorage.get(REFRESH_KEY);
      if (!stored) return null;
      try {
        const next = await cognito.refresh(stored);
        tokens.current = next;
        return next;
      } catch {
        // A stored session that can no longer be refreshed has expired.
        clear('expired');
        return null;
      }
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [cognito, clear]);

  // Restore a session kept in this tab. Concurrent calls (StrictMode) share one refresh.
  useEffect(() => {
    if (status !== 'loading') return;
    let live = true;
    void refresh().then((restored) => {
      if (!live) return;
      const who = tabStorage.get(EMAIL_KEY);
      if (restored && who) {
        setEmail(who);
        setStatus('signed_in');
      } else if (restored) {
        clear(null);
      }
    });
    return () => {
      live = false;
    };
    // Runs once on load; later refreshes happen through getAccessToken.
  }, []);

  const getAccessToken = useCallback(async () => {
    const current = tokens.current;
    if (current && current.expiresAt - Date.now() > EXPIRY_MARGIN_MS)
      return current.accessToken;
    return (await refresh())?.accessToken ?? null;
  }, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      email,
      signedOutReason,
      async signIn(who, password) {
        if (!cognito)
          throw new CognitoError(
            'CONFIG',
            'Sign-in isn’t set up for this site yet.',
          );
        const trimmed = who.trim();
        const result = await cognito.signIn(trimmed, password);
        if (result.kind === 'signed_in') accept(result.tokens, trimmed);
        return result;
      },
      async completeNewPassword(who, newPassword, session) {
        if (!cognito)
          throw new CognitoError(
            'CONFIG',
            'Sign-in isn’t set up for this site yet.',
          );
        const trimmed = who.trim();
        accept(
          await cognito.completeNewPassword(trimmed, newPassword, session),
          trimmed,
        );
      },
      signOut(reason = 'signed_out') {
        const refreshToken =
          tokens.current?.refreshToken ?? tabStorage.get(REFRESH_KEY);
        // Clear locally first so the user is signed out at once; revoking happens in the background.
        clear(reason);
        if (refreshToken && cognito) void cognito.revoke(refreshToken);
      },
      getAccessToken,
    }),
    [status, email, signedOutReason, cognito, accept, clear, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
