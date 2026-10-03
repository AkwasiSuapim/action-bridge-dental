import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { useTheme } from './theme';

/**
 * Sets the status bar while this screen is focused and restores the theme default on blur.
 * Tab screens stay mounted, so a rendered <StatusBar> would leak between tabs.
 */
export function useFocusStatusBar(style: 'light' | 'dark') {
  const { dark } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      return () => setStatusBarStyle(dark ? 'light' : 'dark');
    }, [style, dark]),
  );
}
