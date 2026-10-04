import type { AgentJobView } from '@actionbridge/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTerminal, pollDelayMs } from '../domain/answers';
import { asApiError, type ApiClient, type ApiError } from '../services/api';
import { useApi } from './auth';

const MAX_WAIT_MS = 120_000;

/**
 * Follows one agent job: bounded polling with backoff until it needs the user, finishes, fails or
 * is cancelled. Keyed by job ID, so leaving and coming back resumes from the stored job.
 */
export function useJob(jobId: string | undefined) {
  const api = useApi();
  const [job, setJob] = useState<AgentJobView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const generation = useRef(0);

  const follow = useCallback(async () => {
    if (!jobId) return;
    const mine = ++generation.current;
    setError(null);
    setTimedOut(false);
    const started = Date.now();
    for (let attempt = 0; generation.current === mine; attempt++) {
      try {
        const next = await api.getJob(jobId);
        if (generation.current !== mine) return;
        setJob(next);
        if (isTerminal(next.status)) return;
      } catch (caught) {
        if (generation.current === mine) setError(asApiError(caught));
        return;
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        setTimedOut(true);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs(attempt)));
    }
  }, [api, jobId]);

  useEffect(() => {
    setJob(null);
    void follow();
    return () => {
      generation.current++;
    };
  }, [follow]);

  return { job, error, timedOut, refresh: follow };
}

/** Polls a job until it needs the user or ends; bounded so a screen never waits forever. */
export async function waitForJob(
  api: ApiClient,
  jobId: string,
  isCancelled: () => boolean,
  maxMs = 90_000,
): Promise<AgentJobView | null> {
  const started = Date.now();
  for (let attempt = 0; !isCancelled(); attempt++) {
    const job = await api.getJob(jobId);
    if (isTerminal(job.status)) return job;
    if (Date.now() - started > maxMs) return null;
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs(attempt)));
  }
  return null;
}
