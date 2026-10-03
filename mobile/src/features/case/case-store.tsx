import type { DentalCase } from '@actionbridge/contracts';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { asApiError, type ApiError } from '../../services/api';
import { useApi } from '../../services/api-context';

/**
 * In-memory cache of cases loaded this session, so screens in one flow share the same revision.
 * The server stays the source of truth: every write is followed by a reload.
 */
interface CaseStore {
  cases: Record<string, DentalCase>;
  put(record: DentalCase): void;
}

const CaseContext = createContext<CaseStore | null>(null);

export function CaseProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<Record<string, DentalCase>>({});
  const put = useCallback((record: DentalCase) => setCases((current) => ({ ...current, [record.caseId]: record })), []);
  return <CaseContext.Provider value={{ cases, put }}>{children}</CaseContext.Provider>;
}

export function useCase(caseId: string | undefined) {
  const store = useContext(CaseContext);
  if (!store) throw new Error('useCase must be used inside CaseProvider');
  const api = useApi();
  const record = caseId ? (store.cases[caseId] ?? null) : null;
  const [loading, setLoading] = useState(record === null);
  const [error, setError] = useState<ApiError | null>(null);
  const { put } = store;

  const reload = useCallback(async () => {
    if (!caseId) return null;
    setLoading(true);
    setError(null);
    try {
      const fresh = await api.getCase(caseId);
      put(fresh);
      return fresh;
    } catch (caught) {
      setError(asApiError(caught));
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, caseId, put]);

  useEffect(() => {
    if (caseId && !store.cases[caseId]) void reload();
    // Load once per case; screens call reload() explicitly after writes or conflicts.
  }, [caseId]);

  return { record, loading: loading && record === null, error, reload };
}
