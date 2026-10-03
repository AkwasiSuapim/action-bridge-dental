import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppConfig } from '../../lib/config';
import { createCognitoClient, type SignInResult, type Tokens } from './cognito';

/**
 * Session state. Only the refresh token and email are persisted, in platform secure storage;
 * the access token lives in memory. Signing out clears both and revokes the refresh token.
 */
type Status = 'loading' | 'signed_out' | 'signed_in';
/** Why the user is signed out, so Welcome can say so. Null on a fresh start. */
export type SignedOutReason = 'expired' | 'signed_out' | null;

interface AuthValue {
  status: Status;
  email: string | null;
  signedOutReason: SignedOutReason;
  signIn(email: string, password: string): Promise<SignInResult>;
  completeNewPassword(email: string, newPassword: string, session: string): Promise<void>;
  signOut(): Promise<void>;
  /** A valid access token, refreshed when within a minute of expiry; signs out if refresh fails. */
  getAccessToken(): Promise<string | null>;
}

const REFRESH_KEY = 'actionbridge.refreshToken';
const EMAIL_KEY = 'actionbridge.email';
const EXPIRY_MARGIN_MS = 60_000;

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const cognito = useMemo(() => createCognitoClient({ region: config.cognitoRegion, clientId: config.cognitoClientId }), [config]);
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason>(null);
  const tokens = useRef<Tokens | null>(null);
  const refreshing = useRef<Promise<Tokens | null> | null>(null);

  const clear = useCallback(async (reason: SignedOutReason) => {
    tokens.current = null;
    await Promise.all([SecureStore.deleteItemAsync(REFRESH_KEY), SecureStore.deleteItemAsync(EMAIL_KEY)]);
    setEmail(null);
    setSignedOutReason(reason);
    setStatus('signed_out');
  }, []);

  const accept = useCallback(async (next: Tokens, who: string) => {
    tokens.current = next;
    await Promise.all([SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken), SecureStore.setItemAsync(EMAIL_KEY, who)]);
    setEmail(who);
    setSignedOutReason(null);
    setStatus('signed_in');
  }, []);

  const refresh = useCallback(async (): Promise<Tokens | null> => {
    if (!refreshing.current) {
      refreshing.current = (async () => {
        const stored = tokens.current?.refreshToken ?? (await SecureStore.getItemAsync(REFRESH_KEY));
        if (!stored) return null;
        try {
          const next = await cognito.refresh(stored);
          tokens.current = next;
          return next;
        } catch {
          // A stored session that can no longer be refreshed has expired.
          await clear('expired');
          return null;
        }
      })().finally(() => {
        refreshing.current = null;
      });
    }
    return refreshing.current;
  }, [cognito, clear]);

  useEffect(() => {
    (async () => {
      const storedEmail = await SecureStore.getItemAsync(EMAIL_KEY);
      const restored = await refresh();
      if (restored && storedEmail) {
        setEmail(storedEmail);
        setStatus('signed_in');
      } else {
        setStatus('signed_out');
      }
    })();
  }, [refresh]);

  const getAccessToken = useCallback(async () => {
    const current = tokens.current;
    if (current && current.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return current.accessToken;
    return (await refresh())?.accessToken ?? null;
  }, [refresh]);

  const value: AuthValue = {
    status,
    email,
    signedOutReason,
    async signIn(who, password) {
      const result = await cognito.signIn(who.trim(), password);
      if (result.kind === 'signed_in') await accept(result.tokens, who.trim());
      return result;
    },
    async completeNewPassword(who, newPassword, session) {
      await accept(await cognito.completeNewPassword(who.trim(), newPassword, session), who.trim());
    },
    async signOut() {
      const refreshToken = tokens.current?.refreshToken;
      if (refreshToken) await cognito.revoke(refreshToken);
      await clear('signed_out');
    },
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
