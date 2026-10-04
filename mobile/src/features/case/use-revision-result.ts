import { useCallback, useEffect, useRef, useState } from 'react';
import { asApiError, type ApiError } from '../../services/api';

/**
 * Loads a server result for the case's current revision. A response for an older revision is
 * dropped (it can arrive after a newer one), and a 409 reloads the case so the next revision loads.
 * `current` is null until a result for the current revision is in.
 */
export function useRevisionResult<T>(
  caseId: string | undefined,
  revision: number | undefined,
  reload: () => Promise<unknown>,
  fetch: (caseId: string, revision: number) => Promise<T>,
) {
  const [result, setResult] = useState<{ revision: number; value: T } | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const latest = useRef(revision);
  latest.current = revision;
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  const load = useCallback(async () => {
    if (!caseId || revision === undefined) return;
    setFailure(null);
    try {
      const value = await fetchRef.current(caseId, revision);
      if (latest.current === revision) setResult({ revision, value });
    } catch (caught) {
      if (latest.current !== revision) return;
      const apiError = asApiError(caught);
      if (apiError.code === 'REVISION_CONFLICT') await reload();
      else setFailure(apiError);
    }
  }, [caseId, revision, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = result && result.revision === revision ? result.value : null;
  return { current, failure, retry: load };
}
