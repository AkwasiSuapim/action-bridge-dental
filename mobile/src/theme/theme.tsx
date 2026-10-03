import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

interface Theme {
  colors: Palette;
  dark: boolean;
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme>({ colors: palettes.light, dark: false, reduceMotion: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
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
