import type {
  CoverageComparison,
  CreateCaseRequest,
  DentalCase,
  DentalCaseInput,
  EstimateResult,
  PatchCaseRequest,
  SavedStrategy,
  Scenario,
  ScenarioComparisonResult,
} from '@actionbridge/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { changesFrom } from '../domain/edits';
import { ApiError, asApiError } from '../services/api';
import { useApi, useAuth } from './auth';

/**
 * The signed-in user's current case, always read from the API. Edits are PATCHes against the
 * revision on screen (a stale revision is a 409, never a silent overwrite); results are fetched
 * from the server for the exact revision shown. The browser keeps only a list of recent case IDs
 * (no plan data) so "Continue" and Activity can find them again.
 */
export type Results = {
  estimate: EstimateResult;
  scenarios: ScenarioComparisonResult;
  coverage: CoverageComparison;
};
type ResultsState = {
  key: string;
  status: 'loading' | 'ready' | 'error';
  data: Results | null;
  error: ApiError | null;
};

type CaseStore = {
  caseId: string | null;
  record: DentalCase | null;
  loading: boolean;
  error: ApiError | null;
  recent: string[];
  open: (caseId: string) => void;
  reload: () => Promise<DentalCase | null>;
  create: (
    request: CreateCaseRequest,
  ) => Promise<{ caseId: string; caseRevision: number }>;
  /** Saves an edited copy of the case; resolves to the new revision. */
  update: (draft: DentalCaseInput) => Promise<void>;
  patch: (changes: PatchCaseRequest['changes']) => Promise<void>;
  saved: SavedStrategy | null;
  setSaved: (strategy: SavedStrategy) => void;
  selectedId: string | null;
  select: (scenarioId: string) => void;
  results: ResultsState | null;
  loadResults: (force?: boolean) => void;
  clear: () => void;
};

const Context = createContext<CaseStore | null>(null);
const MAX_RECENT = 20;

function recentKey(email: string) {
  return `actionbridge.web.cases.v1.${email}`;
}
function readRecent(email: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(email)) ?? '[]');
    return Array.isArray(raw)
      ? raw
          .filter((id): id is string => typeof id === 'string')
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function CaseProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { session } = useAuth();
  const email = session?.email ?? '';
  const [recent, setRecent] = useState<string[]>(() => readRecent(email));
  const [caseId, setCaseId] = useState<string | null>(
    () => readRecent(email)[0] ?? null,
  );
  const [record, setRecord] = useState<DentalCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSavedState] = useState<SavedStrategy | null>(null);
  const [selected, setSelected] = useState<{ key: string; id: string } | null>(
    null,
  );
  const [results, setResults] = useState<ResultsState | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const ids = readRecent(email);
    setRecent(ids);
    setCaseId(ids[0] ?? null);
  }, [email]);

  const remember = useCallback(
    (id: string) => {
      setRecent((current) => {
        const next = [id, ...current.filter((c) => c !== id)].slice(
          0,
          MAX_RECENT,
        );
        try {
          localStorage.setItem(recentKey(email), JSON.stringify(next));
        } catch {
          /* Storage blocked: the list lasts for this visit. */
        }
        return next;
      });
    },
    [email],
  );

  const fetchCase = useCallback(
    async (id: string): Promise<DentalCase | null> => {
      const mine = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const [next, strategies] = await Promise.all([
          api.getCase(id),
          api.listStrategies(id).catch(() => ({ strategies: [] })),
        ]);
        if (mine !== generation.current) return null;
        setRecord(next);
        setSavedState(strategies.strategies[0] ?? null);
        return next;
      } catch (caught) {
        if (mine !== generation.current) return null;
        const failure = asApiError(caught);
        setError(failure);
        // A case that no longer exists (expired or another account's) leaves the recent list.
        if (failure.code === 'NOT_FOUND') {
          setRecent((current) => {
            const next = current.filter((c) => c !== id);
            try {
              localStorage.setItem(recentKey(email), JSON.stringify(next));
            } catch {
              /* ignore */
            }
            return next;
          });
          setRecord(null);
        }
        return null;
      } finally {
        if (mine === generation.current) setLoading(false);
      }
    },
    [api, email],
  );

  useEffect(() => {
    setRecord(null);
    setSavedState(null);
    setResults(null);
    if (caseId) void fetchCase(caseId);
  }, [caseId, fetchCase]);

  const resultsKey = record ? `${record.caseId}@${record.caseRevision}` : null;
  const loadResults = useCallback(
    (force = false) => {
      if (!record || !resultsKey) return;
      // One automatic load per revision. A failure stays on screen until the user retries or the
      // case changes; retrying automatically here caused a request loop on a 422.
      if (!force && results?.key === resultsKey) return;
      const key = resultsKey;
      setResults({ key, status: 'loading', data: null, error: null });
      void Promise.all([
        api.estimate(record.caseId, record.caseRevision),
        api.scenarios(record.caseId, record.caseRevision),
        api.coverageComparison(record.caseId, record.caseRevision),
      ])
        .then(([estimate, scenarios, coverage]) =>
          setResults((current) =>
            current?.key === key
              ? {
                  key,
                  status: 'ready',
                  data: { estimate, scenarios, coverage },
                  error: null,
                }
              : current,
          ),
        )
        .catch((caught: unknown) => {
          const failure = asApiError(caught);
          // The case moved on (edited elsewhere): reload it rather than show an old result.
          if (failure.code === 'REVISION_CONFLICT')
            void fetchCase(record.caseId);
          setResults((current) =>
            current?.key === key
              ? { key, status: 'error', data: null, error: failure }
              : current,
          );
        });
    },
    [api, record, resultsKey, results, fetchCase],
  );

  const patch = useCallback(
    async (changes: PatchCaseRequest['changes']) => {
      if (!record) throw new ApiError('NOT_FOUND', 'Open a case first.');
      try {
        await api.patchCase(record.caseId, {
          expectedRevision: record.caseRevision,
          changes,
        });
      } catch (caught) {
        const failure = asApiError(caught);
        if (failure.code === 'REVISION_CONFLICT') {
          await fetchCase(record.caseId);
          throw new ApiError(
            'REVISION_CONFLICT',
            'This case changed in another window. We loaded the latest details — check them and try again.',
          );
        }
        throw failure;
      }
      await fetchCase(record.caseId);
    },
    [api, record, fetchCase],
  );

  const value: CaseStore = {
    caseId,
    record: record && record.caseId === caseId ? record : null,
    loading,
    error,
    recent,
    open: (id) => {
      remember(id);
      if (id === caseId) void fetchCase(id);
      else setCaseId(id);
    },
    reload: () => (caseId ? fetchCase(caseId) : Promise.resolve(null)),
    create: async (request) => {
      const created = await api.createCase(request);
      remember(created.caseId);
      setCaseId(created.caseId);
      return created;
    },
    update: async (draft) => {
      if (!record) throw new ApiError('NOT_FOUND', 'Open a case first.');
      const changes = changesFrom(record, draft, new Date());
      if (changes) await patch(changes);
    },
    patch,
    saved,
    setSaved: (strategy) => setSavedState(strategy),
    selectedId: selected && selected.key === resultsKey ? selected.id : null,
    select: (id) => resultsKey && setSelected({ key: resultsKey, id }),
    results: results && results.key === resultsKey ? results : null,
    loadResults,
    clear: () => setCaseId(null),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCase() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing case provider');
  return context;
}

/**
 * Server results for the current revision, loaded on first use and shared by Options, Details and
 * Review. `scenarios` lists the baseline first, then alternatives.
 */
export function useResults() {
  const { record, results, loadResults, selectedId } = useCase();
  useEffect(() => {
    if (record) loadResults();
  }, [record, loadResults]);
  const comparison =
    results?.data?.scenarios.status === 'estimated'
      ? results.data.scenarios
      : null;
  const scenarios: Scenario[] = comparison
    ? [comparison.baseline, ...comparison.alternatives]
    : [];
  const selected =
    scenarios.find((s) => s.scenarioId === selectedId) ?? scenarios[0] ?? null;
  return {
    status: results?.status ?? 'loading',
    error: results?.error ?? null,
    data: results?.data ?? null,
    comparison,
    scenarios,
    selected,
    retry: () => loadResults(true),
  };
}
