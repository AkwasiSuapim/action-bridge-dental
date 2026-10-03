import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

interface Theme {
  colors: Palette;
  dark: boolean;
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme>({ colors: palettes.light, dark: false, reduceMotion: false });

/** `scheme` forces a palette for one subtree (e.g. the always-dark Welcome screen); omitted, it follows the system. */
export function ThemeProvider({ children, scheme: forced }: { children: ReactNode; scheme?: 'light' | 'dark' }) {
  const system = useColorScheme();
  const scheme = forced ?? system;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const dark = scheme === 'dark';
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark, reduceMotion }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
