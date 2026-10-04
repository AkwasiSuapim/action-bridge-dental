import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deviceStorage } from '../../lib/device-storage';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';
import { useAuth } from '../auth/auth-context';
import { addRecent, parseRecent, recentKey, type RecentCase } from './recent';
import { caseSummary, type CaseSummary } from './summary';

export type SummaryState = { status: 'loading' } | { status: 'ok'; summary: CaseSummary } | { status: 'error'; error: ApiError };

interface RecentCasesValue {
  loaded: boolean;
  items: RecentCase[];
  summaries: Record<string, SummaryState>;
  remember(caseId: string): Promise<void>;
  refresh(): Promise<void>;
}

const RecentContext = createContext<RecentCasesValue | null>(null);

/** Recent cases for the signed-in account: IDs from device storage, everything else live from the API. */
export function RecentCasesProvider({ children }: { children: ReactNode }) {
  const { email } = useAuth();
  const api = useApi();
  const key = email ? recentKey(email) : null;
  const [items, setItems] = useState<RecentCase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const persist = useCallback(
    async (next: RecentCase[]) => {
      setItems(next);
      if (key) await deviceStorage.set(key, JSON.stringify(next)).catch(() => undefined);
    },
    [key],
  );

  useEffect(() => {
    setLoaded(false);
    setItems([]);
    setSummaries({});
    if (!key) {
      setLoaded(true);
      return;
    }
    deviceStorage
      .get(key)
      .then((raw) => setItems(parseRecent(raw)))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [key]);

  const refresh = useCallback(async () => {
    const current = itemsRef.current;
    setSummaries((previous) => Object.fromEntries(current.map((item) => [item.caseId, previous[item.caseId] ?? { status: 'loading' as const }])));
    const results = await Promise.all(
      current.map(async (item) => {
        try {
          const [record, ledger] = await Promise.all([api.getCase(item.caseId), api.ledger(item.caseId)]);
          return [item.caseId, { status: 'ok', summary: caseSummary(record, ledger.events) }] as const;
        } catch (caught) {
          return [item.caseId, { status: 'error', error: asApiError(caught) }] as const;
        }
      }),
    );
    // Cases removed by the server's retention policy (404) are forgotten on this device too.
    const gone = new Set(results.filter(([, state]) => state.status === 'error' && state.error.code === 'NOT_FOUND').map(([id]) => id));
    if (gone.size > 0) await persist(current.filter((item) => !gone.has(item.caseId)));
    setSummaries(Object.fromEntries(results.filter(([id]) => !gone.has(id))) as Record<string, SummaryState>);
  }, [api, persist]);

  const remember = useCallback((caseId: string) => persist(addRecent(itemsRef.current, caseId, new Date().toISOString())), [persist]);

  const value = useMemo(() => ({ loaded, items, summaries, remember, refresh }), [loaded, items, summaries, remember, refresh]);
  return <RecentContext.Provider value={value}>{children}</RecentContext.Provider>;
}

export function useRecentCases(): RecentCasesValue {
  const value = useContext(RecentContext);
  if (!value) throw new Error('useRecentCases must be used inside RecentCasesProvider');
  return value;
}
