import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../features/auth/auth-context';
import type { AppConfig } from '../lib/config';
import { createApiClient, type ApiClient } from './api';

const ApiContext = createContext<ApiClient | null>(null);

/** Provides the live API client, authorized with the signed-in user's Cognito access token. */
export function ApiProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const { getAccessToken } = useAuth();
  const client = useMemo(() => createApiClient({ baseUrl: config.apiBaseUrl, getAccessToken }), [config, getAccessToken]);
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside ApiProvider');
  return client;
}
