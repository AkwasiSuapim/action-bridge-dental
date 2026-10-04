import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useRecentCases } from './recent-cases';

/** Re-fetch case summaries whenever the screen comes into view, once the stored list is loaded. */
export function useRefreshOnFocus() {
  const recent = useRecentCases();
  const { loaded, refresh } = recent;
  useFocusEffect(
    useCallback(() => {
      if (loaded) void refresh();
    }, [loaded, refresh]),
  );
  return recent;
}
