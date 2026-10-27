'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from './api';
import { useRealtime, useWorkspace } from '@/components/providers';

interface UseApiDataOptions {
  deps?: unknown[];
  refreshKey?: number | string;
  enabled?: boolean;
}

export function useApiData<T = any>(path: string | null, options: UseApiDataOptions = {}) {
  const { activeWorkspace } = useWorkspace();
  const realtime = useRealtime();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path) && options.enabled !== false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);
  const depsKey = JSON.stringify(options.deps || []);
  const workspaceId = activeWorkspace?.id || '';

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!path || options.enabled === false) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    apiGet<T>(path)
      .then((result) => {
        if (!cancelled && current === requestId.current) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled && current === requestId.current) setError(err instanceof ApiError ? err.message : 'Unable to load this section.');
      })
      .finally(() => {
        if (!cancelled && current === requestId.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, workspaceId, depsKey, options.refreshKey ?? '', realtime.version, nonce, options.enabled]);

  return { data, setData, loading, error, refetch };
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useAsyncAction<TArgs extends unknown[] = [], TResult = unknown>(
  action: (...args: TArgs) => Promise<TResult>,
): { run: (...args: TArgs) => Promise<TResult | null>; loading: boolean; error: string | null; clearError: () => void } {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: TArgs) => {
      setLoading(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'The action could not be completed.';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [action],
  );
  return { run, loading, error, clearError: () => setError(null) };
}
